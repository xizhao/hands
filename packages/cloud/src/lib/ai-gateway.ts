import { Hono } from "hono";
import type { Env, User } from "../types";
import { verifyToken } from "./auth";
import { getDb } from "./db";
import { users } from "../schema/users";
import { subscriptions } from "../schema/subscriptions";
import { usageDaily } from "../schema/usage";
import { eq, and, sql } from "drizzle-orm";
import { aiRateLimit } from "./rate-limit";

/**
 * AI Gateway proxy that forwards requests to Cloudflare AI Gateway
 * with user metadata for tracking.
 *
 * CF AI Gateway handles:
 * - Routing to providers (Anthropic, OpenAI, etc.)
 * - Caching
 * - Rate limiting
 * - Analytics with custom metadata
 *
 * We handle:
 * - JWT validation
 * - Quota checking (hard limit for free, soft limit with overage for paid)
 * - Adding cf-aig-metadata header with userId
 * - Rate limiting
 */
export const aiGateway = new Hono<{ Bindings: Env }>();

// Rate limiting for AI requests
aiGateway.use("*", aiRateLimit);

// Middleware: validate JWT and check quota
aiGateway.use("*", async (c, next) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);
  const payload = await verifyToken(token, c.env.AUTH_SECRET);
  if (!payload?.sub) {
    return c.json({ error: "Invalid token" }, 401);
  }

  // Fetch user
  const db = getDb(c.env.DB);
  const user = await db
    .select()
    .from(users)
    .where(eq(users.id, payload.sub))
    .limit(1)
    .then((rows) => rows[0]);

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  // Get subscription and current usage
  const subscription = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, user.id))
    .limit(1)
    .then((rows) => rows[0]);

  // Get current month usage
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);

  const usage = await db
    .select({
      totalTokens: sql<number>`COALESCE(SUM(${usageDaily.tokensInput} + ${usageDaily.tokensOutput}), 0)`,
    })
    .from(usageDaily)
    .where(
      and(
        eq(usageDaily.userId, user.id),
        sql`${usageDaily.date} >= ${monthStart.toISOString().split("T")[0]}`,
        sql`${usageDaily.date} <= ${monthEnd.toISOString().split("T")[0]}`
      )
    )
    .then((rows) => rows[0]);

  const currentTokens = usage?.totalTokens ?? 0;
  const includedTokens = subscription?.includedTokens ?? 50000;
  const plan = subscription?.plan ?? "free";

  // Check quota based on plan
  if (currentTokens >= includedTokens) {
    if (plan === "free") {
      // Free users: hard limit
      return c.json(
        {
          error: "Quota exceeded",
          message: "You've used all your free tokens this month. Upgrade to Pro for more.",
          usage: { current: currentTokens, limit: includedTokens },
          upgrade_url: `${c.env.APP_URL}/billing`,
        },
        429
      );
    } else {
      // Paid users: allow overage but add warning header
      const overageTokens = currentTokens - includedTokens;
      const overageCost = Math.round(overageTokens / 1000); // $0.01 per 1K tokens
      c.header("X-Usage-Warning", "overage");
      c.header("X-Usage-Current", String(currentTokens));
      c.header("X-Usage-Included", String(includedTokens));
      c.header("X-Usage-Overage-Tokens", String(overageTokens));
      c.header("X-Usage-Overage-Cost-Cents", String(overageCost));
    }
  }

  // Store user in context for metadata
  c.set("user" as never, user);
  c.set("subscription" as never, subscription);

  await next();
});

// Proxy to CF AI Gateway
aiGateway.all("/*", async (c) => {
  const user = c.get("user" as never) as User;
  const path = c.req.path.replace("/ai", ""); // Remove /ai prefix

  // Build CF AI Gateway URL
  // Format: https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_id}/{provider}/{endpoint}
  const gatewayUrl = `https://gateway.ai.cloudflare.com/v1/${c.env.AI_GATEWAY_ACCOUNT_ID}/${c.env.AI_GATEWAY_ID}${path}`;

  // Clone request with metadata header
  const headers = new Headers(c.req.raw.headers);
  headers.set(
    "cf-aig-metadata",
    JSON.stringify({
      userId: user.id,
      email: user.email,
    })
  );

  // Forward to AI Gateway
  const response = await fetch(gatewayUrl, {
    method: c.req.method,
    headers,
    body: c.req.method !== "GET" ? c.req.raw.body : undefined,
    duplex: "half",
  });

  // Return response (streaming is preserved)
  return new Response(response.body, {
    status: response.status,
    headers: response.headers,
  });
});
