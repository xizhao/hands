import { Hono } from "hono";
import type { Env, User } from "../../types";
import { verifyToken } from "../auth/client";
import { getDb } from "../../lib/db";
import { users } from "../../schema/users";
import { subscriptions } from "../../schema/subscriptions";
import { usageDaily } from "../../schema/usage";
import { eq, and, sql } from "drizzle-orm";
import { aiRateLimit } from "../../lib/rate-limit";
import { proxyToGateway } from "./client";

/**
 * AI Gateway Hono app
 *
 * Mounted at /ai in the main app.
 * Handles JWT validation, quota checking, and proxies to CF AI Gateway.
 */
export const aiGateway = new Hono<{ Bindings: Env }>();

// Rate limiting
aiGateway.use("*", aiRateLimit);

// Auth + Quota middleware
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

  // Get subscription
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

  // Check quota
  if (currentTokens >= includedTokens) {
    if (plan === "free") {
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
      // Paid users: allow overage with warning headers
      const overageTokens = currentTokens - includedTokens;
      const overageCost = Math.round(overageTokens / 1000);
      c.header("X-Usage-Warning", "overage");
      c.header("X-Usage-Current", String(currentTokens));
      c.header("X-Usage-Included", String(includedTokens));
      c.header("X-Usage-Overage-Tokens", String(overageTokens));
      c.header("X-Usage-Overage-Cost-Cents", String(overageCost));
    }
  }

  c.set("user" as never, user);
  c.set("subscription" as never, subscription);

  await next();
});

// Proxy all requests to CF AI Gateway
aiGateway.all("/*", async (c) => {
  const user = c.get("user" as never) as User;

  return proxyToGateway(c.env, c.req.raw, c.req.path, {
    userId: user.id,
    email: user.email,
  });
});
