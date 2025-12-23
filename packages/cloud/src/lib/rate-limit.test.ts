import { describe, expect, test, beforeEach } from "bun:test";
import { Hono } from "hono";
import { rateLimit } from "./rate-limit";
import type { Env, RateLimitEntry } from "../types";

// Mock KV namespace
class MockKV {
  private store = new Map<string, string>();

  async get<T>(key: string, type?: string): Promise<T | null> {
    const value = this.store.get(key);
    if (!value) return null;
    if (type === "json") return JSON.parse(value) as T;
    return value as unknown as T;
  }

  async put(
    key: string,
    value: string,
    _options?: { expirationTtl?: number }
  ): Promise<void> {
    this.store.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}

describe("rate limiting", () => {
  let mockKV: MockKV;
  let app: Hono<{ Bindings: Env }>;

  beforeEach(() => {
    mockKV = new MockKV();

    app = new Hono<{ Bindings: Env }>();

    // Add rate limiting middleware
    app.use(
      "*",
      rateLimit({
        limit: 3,
        windowSeconds: 60,
        keyPrefix: "test",
      })
    );

    app.get("/test", (c) => c.json({ ok: true }));

    // Bind mock KV
    app.use("*", async (c, next) => {
      c.env = {
        ...c.env,
        RATE_LIMIT: mockKV as unknown as KVNamespace,
      } as Env;
      await next();
    });
  });

  test("should allow requests under the limit", async () => {
    const env = { RATE_LIMIT: mockKV } as unknown as Env;

    // Create a fresh app for this test
    const testApp = new Hono<{ Bindings: Env }>();
    testApp.use(
      "*",
      rateLimit({ limit: 3, windowSeconds: 60, keyPrefix: "test" })
    );
    testApp.get("/test", (c) => c.json({ ok: true }));

    const req = new Request("http://localhost/test", {
      headers: { "CF-Connecting-IP": "1.2.3.4" },
    });

    const res = await testApp.fetch(req, env);
    expect(res.status).toBe(200);
    expect(res.headers.get("X-RateLimit-Limit")).toBe("3");
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("2");
  });

  test("should block requests over the limit", async () => {
    const env = { RATE_LIMIT: mockKV } as unknown as Env;

    const testApp = new Hono<{ Bindings: Env }>();
    testApp.use(
      "*",
      rateLimit({ limit: 3, windowSeconds: 60, keyPrefix: "test" })
    );
    testApp.get("/test", (c) => c.json({ ok: true }));

    const req = () =>
      new Request("http://localhost/test", {
        headers: { "CF-Connecting-IP": "1.2.3.4" },
      });

    // Make 3 requests (allowed)
    await testApp.fetch(req(), env);
    await testApp.fetch(req(), env);
    await testApp.fetch(req(), env);

    // 4th request should be blocked
    const res = await testApp.fetch(req(), env);
    expect(res.status).toBe(429);

    const body = (await res.json()) as { error: string; retryAfter: number };
    expect(body.error).toBe("Rate limit exceeded");
    expect(body.retryAfter).toBeGreaterThan(0);
  });

  test("should include rate limit headers", async () => {
    const env = { RATE_LIMIT: mockKV } as unknown as Env;

    const testApp = new Hono<{ Bindings: Env }>();
    testApp.use(
      "*",
      rateLimit({ limit: 5, windowSeconds: 60, keyPrefix: "headers" })
    );
    testApp.get("/test", (c) => c.json({ ok: true }));

    const req = new Request("http://localhost/test", {
      headers: { "CF-Connecting-IP": "5.6.7.8" },
    });

    const res = await testApp.fetch(req, env);

    expect(res.headers.get("X-RateLimit-Limit")).toBe("5");
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("4");
    expect(res.headers.get("X-RateLimit-Reset")).toBeTruthy();
  });

  test("should use different counters for different IPs", async () => {
    const env = { RATE_LIMIT: mockKV } as unknown as Env;

    const testApp = new Hono<{ Bindings: Env }>();
    testApp.use(
      "*",
      rateLimit({ limit: 2, windowSeconds: 60, keyPrefix: "multi" })
    );
    testApp.get("/test", (c) => c.json({ ok: true }));

    // IP 1 makes 2 requests
    const req1 = () =>
      new Request("http://localhost/test", {
        headers: { "CF-Connecting-IP": "10.0.0.1" },
      });
    await testApp.fetch(req1(), env);
    await testApp.fetch(req1(), env);

    // IP 1 should be blocked
    const res1 = await testApp.fetch(req1(), env);
    expect(res1.status).toBe(429);

    // IP 2 should still be allowed
    const req2 = new Request("http://localhost/test", {
      headers: { "CF-Connecting-IP": "10.0.0.2" },
    });
    const res2 = await testApp.fetch(req2, env);
    expect(res2.status).toBe(200);
  });

  test("should reset after window expires", async () => {
    const env = { RATE_LIMIT: mockKV } as unknown as Env;

    // Pre-populate KV with an expired entry
    const expiredEntry: RateLimitEntry = {
      count: 100,
      resetAt: Date.now() - 1000, // 1 second ago
    };
    await mockKV.put("expired:ip:9.9.9.9", JSON.stringify(expiredEntry));

    const testApp = new Hono<{ Bindings: Env }>();
    testApp.use(
      "*",
      rateLimit({ limit: 5, windowSeconds: 60, keyPrefix: "expired" })
    );
    testApp.get("/test", (c) => c.json({ ok: true }));

    const req = new Request("http://localhost/test", {
      headers: { "CF-Connecting-IP": "9.9.9.9" },
    });

    // Should succeed because window expired
    const res = await testApp.fetch(req, env);
    expect(res.status).toBe(200);
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("4");
  });

  test("should include Retry-After header when rate limited", async () => {
    const env = { RATE_LIMIT: mockKV } as unknown as Env;

    const testApp = new Hono<{ Bindings: Env }>();
    testApp.use(
      "*",
      rateLimit({ limit: 1, windowSeconds: 60, keyPrefix: "retry" })
    );
    testApp.get("/test", (c) => c.json({ ok: true }));

    const req = () =>
      new Request("http://localhost/test", {
        headers: { "CF-Connecting-IP": "8.8.8.8" },
      });

    // First request
    await testApp.fetch(req(), env);

    // Second request should be blocked
    const res = await testApp.fetch(req(), env);
    expect(res.status).toBe(429);

    const retryAfter = res.headers.get("Retry-After");
    expect(retryAfter).toBeTruthy();
    expect(parseInt(retryAfter!, 10)).toBeGreaterThan(0);
    expect(parseInt(retryAfter!, 10)).toBeLessThanOrEqual(60);
  });
});
