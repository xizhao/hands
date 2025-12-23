import type { Context, Next } from "hono";
import type { Env, RateLimitEntry } from "../types";

export interface RateLimitConfig {
  /** Maximum requests allowed in the window */
  limit: number;
  /** Window size in seconds */
  windowSeconds: number;
  /** Key prefix for KV storage */
  keyPrefix: string;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  limit: 100,
  windowSeconds: 60,
  keyPrefix: "rl",
};

/**
 * Get the client identifier for rate limiting
 */
function getClientId(c: Context<{ Bindings: Env }>): string {
  // Prefer authenticated user ID
  const user = c.get("user" as never) as { id: string } | undefined;
  if (user?.id) {
    return `user:${user.id}`;
  }

  // Fall back to IP address
  const ip =
    c.req.header("CF-Connecting-IP") ||
    c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ||
    "unknown";

  return `ip:${ip}`;
}

/**
 * Rate limiting middleware using KV storage
 */
export function rateLimit(config: Partial<RateLimitConfig> = {}) {
  const { limit, windowSeconds, keyPrefix } = { ...DEFAULT_CONFIG, ...config };

  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    const kv = c.env.RATE_LIMIT;
    const clientId = getClientId(c);
    const key = `${keyPrefix}:${clientId}`;
    const now = Date.now();

    // Get current rate limit entry
    const entry = await kv.get<RateLimitEntry>(key, "json");

    if (entry) {
      // Check if window has expired
      if (now >= entry.resetAt) {
        // Start new window
        const newEntry: RateLimitEntry = {
          count: 1,
          resetAt: now + windowSeconds * 1000,
        };
        await kv.put(key, JSON.stringify(newEntry), {
          expirationTtl: windowSeconds + 60, // Add buffer
        });
        c.header("X-RateLimit-Limit", String(limit));
        c.header("X-RateLimit-Remaining", String(limit - 1));
        c.header("X-RateLimit-Reset", String(Math.ceil(newEntry.resetAt / 1000)));
      } else if (entry.count >= limit) {
        // Rate limit exceeded
        const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
        c.header("X-RateLimit-Limit", String(limit));
        c.header("X-RateLimit-Remaining", "0");
        c.header("X-RateLimit-Reset", String(Math.ceil(entry.resetAt / 1000)));
        c.header("Retry-After", String(retryAfter));

        return c.json(
          {
            error: "Rate limit exceeded",
            retryAfter,
          },
          429
        );
      } else {
        // Increment counter
        entry.count++;
        await kv.put(key, JSON.stringify(entry), {
          expirationTtl: Math.ceil((entry.resetAt - now) / 1000) + 60,
        });
        c.header("X-RateLimit-Limit", String(limit));
        c.header("X-RateLimit-Remaining", String(limit - entry.count));
        c.header("X-RateLimit-Reset", String(Math.ceil(entry.resetAt / 1000)));
      }
    } else {
      // First request in window
      const newEntry: RateLimitEntry = {
        count: 1,
        resetAt: now + windowSeconds * 1000,
      };
      await kv.put(key, JSON.stringify(newEntry), {
        expirationTtl: windowSeconds + 60,
      });
      c.header("X-RateLimit-Limit", String(limit));
      c.header("X-RateLimit-Remaining", String(limit - 1));
      c.header("X-RateLimit-Reset", String(Math.ceil(newEntry.resetAt / 1000)));
    }

    await next();
  };
}

/**
 * Stricter rate limit for sensitive endpoints (auth, etc.)
 */
export const authRateLimit = rateLimit({
  limit: 10,
  windowSeconds: 60,
  keyPrefix: "rl:auth",
});

/**
 * Standard API rate limit
 */
export const apiRateLimit = rateLimit({
  limit: 100,
  windowSeconds: 60,
  keyPrefix: "rl:api",
});

/**
 * AI gateway rate limit (per user)
 */
export const aiRateLimit = rateLimit({
  limit: 60,
  windowSeconds: 60,
  keyPrefix: "rl:ai",
});
