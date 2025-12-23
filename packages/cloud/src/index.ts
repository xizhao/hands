import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./trpc";
import { createContext } from "./trpc/context";
import { aiGateway } from "./lib/ai-gateway";
import { stripeWebhook } from "./lib/stripe-webhook";
import { apiRateLimit, authRateLimit } from "./lib/rate-limit";
import { aggregateUsage } from "./lib/usage-aggregator";
import type { Env } from "./types";

const app = new Hono<{ Bindings: Env }>();

// Middleware
app.use("*", logger());
app.use(
  "*",
  cors({
    origin: (origin) => {
      // No origin header = same-origin request or non-browser client
      // Return null to skip CORS headers (request proceeds normally)
      if (!origin) return null;
      // Allow desktop app (Tauri)
      if (origin.startsWith("tauri://")) return origin;
      // Exact match for hands.app domains
      if (origin === "https://hands.app") return origin;
      if (origin === "https://www.hands.app") return origin;
      if (origin.endsWith(".hands.app") && origin.startsWith("https://")) return origin;
      // Allow localhost for development
      if (origin.includes("localhost")) return origin;
      // Reject unknown origins
      return null;
    },
    credentials: true,
  })
);

// Health check (no rate limiting)
app.get("/health", (c) =>
  c.json({ status: "ok", timestamp: Date.now(), service: "hands-cloud" })
);

// tRPC API with rate limiting
app.use("/trpc/auth.*", authRateLimit);
app.use("/trpc/*", apiRateLimit);
app.all("/trpc/*", async (c) => {
  return fetchRequestHandler({
    endpoint: "/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext: () => createContext(c.req.raw, c.env),
  });
});

// AI Gateway proxy (has its own rate limiting)
app.route("/ai", aiGateway);

// Stripe webhooks (no rate limiting, verified by signature)
app.post("/webhooks/stripe", stripeWebhook);

// OAuth callback (redirects to desktop app via deep link)
app.get("/auth/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  const error = c.req.query("error");

  if (error) {
    return c.redirect(`hands://oauth_callback?error=${encodeURIComponent(error)}`);
  }

  return c.redirect(
    `hands://oauth_callback?code=${encodeURIComponent(code ?? "")}&state=${encodeURIComponent(state ?? "")}`
  );
});

// Integration OAuth callbacks
app.get("/oauth/:provider/callback", async (c) => {
  const provider = c.req.param("provider");
  const code = c.req.query("code");
  const state = c.req.query("state");
  const error = c.req.query("error");

  if (error) {
    return c.redirect(
      `hands://oauth_connect?provider=${provider}&error=${encodeURIComponent(error)}`
    );
  }

  return c.redirect(
    `hands://oauth_connect?provider=${provider}&code=${encodeURIComponent(code ?? "")}&state=${encodeURIComponent(state ?? "")}`
  );
});

// Export for Cloudflare Workers
export default {
  fetch: app.fetch,

  // Scheduled handler for usage aggregation (runs hourly)
  async scheduled(
    _event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    ctx.waitUntil(aggregateUsage(env));
  },
};
