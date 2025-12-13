/**
 * RSC Integration Tests
 *
 * Tests the RSC client module's network layer, error handling, and caching.
 *
 * NOTE: Tests that require actual Flight parsing are skipped because
 * react-server-dom-webpack needs a proper webpack environment with
 * serverConsumerManifest. These tests focus on the network layer
 * and caching logic that can be tested in isolation.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { RscComponentRequest, RscRenderResult } from "../rsc/types";

// We need to test with a fresh module for each describe block
// to properly isolate cache state

describe("RSC Client", () => {
  // We'll test the functions by inspecting their behavior
  // without triggering Flight parsing

  describe("renderComponentViaRsc - request formatting", () => {
    let originalFetch: typeof fetch;
    let capturedRequests: { url: string; options: RequestInit }[] = [];

    beforeEach(() => {
      originalFetch = globalThis.fetch;
      capturedRequests = [];
      globalThis.fetch = mock((url: string | URL, options?: RequestInit) => {
        capturedRequests.push({ url: String(url), options: options || {} });
        // Return 404 to avoid Flight parsing
        return Promise.resolve(
          new Response(JSON.stringify({ error: "test mock" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }) as any;
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    test("sends POST request to correct URL", async () => {
      const { renderComponentViaRsc } = await import("../rsc/client");
      await renderComponentViaRsc(55000, {
        tagName: "Button",
        props: { variant: "primary" },
      });

      expect(capturedRequests.length).toBe(1);
      expect(capturedRequests[0].url).toBe("http://localhost:55000/rsc/component");
      expect(capturedRequests[0].options.method).toBe("POST");
    });

    test("sends correct request body", async () => {
      const { renderComponentViaRsc } = await import("../rsc/client");
      await renderComponentViaRsc(55000, {
        tagName: "Card",
        props: { size: "large", disabled: true },
        children: "<span>Hello</span>",
        elementId: "card-123",
      });

      const body = JSON.parse(capturedRequests[0].options.body as string);
      expect(body).toEqual({
        tagName: "Card",
        props: { size: "large", disabled: true },
        children: "<span>Hello</span>",
        elementId: "card-123",
      });
    });

    test("sets Content-Type header", async () => {
      const { renderComponentViaRsc } = await import("../rsc/client");
      await renderComponentViaRsc(55000, { tagName: "X", props: {} });

      const headers = capturedRequests[0].options.headers as Record<string, string>;
      expect(headers["Content-Type"]).toBe("application/json");
    });
  });

  describe("renderComponentViaRsc - error handling", () => {
    let originalFetch: typeof fetch;

    beforeEach(() => {
      originalFetch = globalThis.fetch;
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    test("handles 404 response", async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response(JSON.stringify({ error: "Component not found: Unknown" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          }),
        ),
      ) as any;

      const { renderComponentViaRsc } = await import("../rsc/client");
      const result = await renderComponentViaRsc(55000, { tagName: "Unknown", props: {} });

      expect(result.element).toBeNull();
      expect(result.error).toContain("Component not found");
    });

    test("handles 500 server error", async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response(JSON.stringify({ error: "Internal server error" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }),
        ),
      ) as any;

      const { renderComponentViaRsc } = await import("../rsc/client");
      const result = await renderComponentViaRsc(55000, { tagName: "Button", props: {} });

      expect(result.element).toBeNull();
      expect(result.error).toBeDefined();
    });

    test("handles network errors gracefully", async () => {
      globalThis.fetch = mock(() => Promise.reject(new Error("Connection refused"))) as any;

      const { renderComponentViaRsc } = await import("../rsc/client");
      const result = await renderComponentViaRsc(55000, { tagName: "Button", props: {} });

      expect(result.element).toBeNull();
      expect(result.error).toContain("Connection refused");
    });

    test("handles non-Flight content type", async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response("<html>Error page</html>", {
            status: 200,
            headers: { "Content-Type": "text/html" },
          }),
        ),
      ) as any;

      const { renderComponentViaRsc } = await import("../rsc/client");
      const result = await renderComponentViaRsc(55000, { tagName: "Button", props: {} });

      expect(result.element).toBeNull();
      expect(result.error).toContain("Expected Flight format");
    });
  });

  describe("renderBlockViaRsc - URL building", () => {
    let originalFetch: typeof fetch;
    let capturedUrls: string[] = [];

    beforeEach(() => {
      originalFetch = globalThis.fetch;
      capturedUrls = [];
      globalThis.fetch = mock((url: string | URL) => {
        capturedUrls.push(String(url));
        return Promise.resolve(
          new Response(null, { status: 503, statusText: "Service Unavailable" }),
        );
      }) as any;
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    test("builds correct URL for block ID", async () => {
      const { renderBlockViaRsc } = await import("../rsc/client");
      await renderBlockViaRsc(55000, "my-block");

      expect(capturedUrls[0]).toContain("http://localhost:55000/blocks/my-block");
    });

    test("adds props as query params", async () => {
      const { renderBlockViaRsc } = await import("../rsc/client");
      await renderBlockViaRsc(55000, "my-block", { limit: 10, filter: "active" });

      expect(capturedUrls[0]).toContain("limit=10");
      expect(capturedUrls[0]).toContain("filter=active");
    });

    test("JSON stringifies object props", async () => {
      const { renderBlockViaRsc } = await import("../rsc/client");
      await renderBlockViaRsc(55000, "my-block", { config: { nested: true } });

      expect(decodeURIComponent(capturedUrls[0])).toContain('{"nested":true}');
    });
  });

  describe("renderBlockViaRsc - error handling", () => {
    let originalFetch: typeof fetch;

    beforeEach(() => {
      originalFetch = globalThis.fetch;
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    test("handles 503 error", async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve(new Response(null, { status: 503, statusText: "Service Unavailable" })),
      ) as any;

      const { renderBlockViaRsc } = await import("../rsc/client");
      const result = await renderBlockViaRsc(55000, "my-block");

      expect(result.element).toBeNull();
      expect(result.error).toContain("Service Unavailable");
    });

    test("handles empty response body", async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response(null, {
            status: 200,
            headers: { "Content-Type": "text/x-component" },
          }),
        ),
      ) as any;

      const { renderBlockViaRsc } = await import("../rsc/client");
      const result = await renderBlockViaRsc(55000, "my-block");

      expect(result.element).toBeNull();
      expect(result.error).toContain("No response body");
    });
  });

  describe("initFlightClient", () => {
    test("returns boolean indicating load status", async () => {
      const { initFlightClient } = await import("../rsc/client");
      // In bun test without webpack, this might fail to load properly
      const result = await initFlightClient();
      expect(typeof result).toBe("boolean");
    });
  });

  describe("invalidateComponentCache", () => {
    test("does not throw when invalidating all", async () => {
      const { invalidateComponentCache } = await import("../rsc/client");
      expect(() => invalidateComponentCache()).not.toThrow();
    });

    test("does not throw when invalidating specific tagName", async () => {
      const { invalidateComponentCache } = await import("../rsc/client");
      expect(() => invalidateComponentCache("Button")).not.toThrow();
    });
  });
});

describe("RSC Cache Behavior", () => {
  // These tests verify caching behavior using internal testing helpers
  // to avoid triggering Suspense promise rejection semantics

  let originalFetch: typeof fetch;
  let fetchCount: number;

  beforeEach(async () => {
    originalFetch = globalThis.fetch;
    fetchCount = 0;
    // Return 404 to trigger error path (no Flight parsing needed)
    globalThis.fetch = mock(() => {
      fetchCount++;
      return Promise.resolve(
        new Response(JSON.stringify({ error: "mock" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }) as any;
  });

  afterEach(async () => {
    globalThis.fetch = originalFetch;
    // Clean up cache
    const { invalidateComponentCache } = await import("../rsc/client");
    invalidateComponentCache();
  });

  test("renderComponentViaRsc makes fetch call each time (no caching at this level)", async () => {
    const { renderComponentViaRsc } = await import("../rsc/client");

    await renderComponentViaRsc(55000, { tagName: "Button", props: {} });
    expect(fetchCount).toBe(1);

    await renderComponentViaRsc(55000, { tagName: "Button", props: {} });
    expect(fetchCount).toBe(2);
  });

  // These tests use _populateCacheForTest to test cache mechanics
  // without triggering Suspense promise rejection

  test("cache stores entries by port:tagName:props key", async () => {
    const {
      invalidateComponentCache,
      _hasCachedComponentPromise,
      _getCacheSize,
      _populateCacheForTest,
    } = await import("../rsc/client");

    invalidateComponentCache();
    expect(_getCacheSize()).toBe(0);

    const request = { tagName: "CacheTest1", props: { variant: "primary" } };

    // Populate cache
    _populateCacheForTest(55000, request);
    expect(_hasCachedComponentPromise(55000, request)).toBe(true);
    expect(_getCacheSize()).toBe(1);

    // Same request doesn't add again
    _populateCacheForTest(55000, request);
    expect(_getCacheSize()).toBe(1); // Still 1
  });

  test("cache creates different entries for different props", async () => {
    const { invalidateComponentCache, _getCacheSize, _populateCacheForTest } = await import(
      "../rsc/client"
    );

    invalidateComponentCache();

    _populateCacheForTest(55000, { tagName: "CacheTest2", props: { variant: "primary" } });
    _populateCacheForTest(55000, { tagName: "CacheTest2", props: { variant: "secondary" } });

    expect(_getCacheSize()).toBe(2); // Two entries
  });

  test("cache creates different entries for different tagNames", async () => {
    const { invalidateComponentCache, _getCacheSize, _populateCacheForTest } = await import(
      "../rsc/client"
    );

    invalidateComponentCache();

    _populateCacheForTest(55000, { tagName: "CacheTestA", props: {} });
    _populateCacheForTest(55000, { tagName: "CacheTestB", props: {} });

    expect(_getCacheSize()).toBe(2);
  });

  test("invalidateComponentCache clears all entries", async () => {
    const { invalidateComponentCache, _getCacheSize, _populateCacheForTest } = await import(
      "../rsc/client"
    );

    invalidateComponentCache();

    _populateCacheForTest(55000, { tagName: "ClearTest1", props: {} });
    _populateCacheForTest(55000, { tagName: "ClearTest2", props: {} });
    expect(_getCacheSize()).toBe(2);

    invalidateComponentCache();
    expect(_getCacheSize()).toBe(0);
  });

  test("invalidateComponentCache with tagName only clears that component", async () => {
    const {
      invalidateComponentCache,
      _hasCachedComponentPromise,
      _getCacheSize,
      _populateCacheForTest,
    } = await import("../rsc/client");

    invalidateComponentCache();

    const reqX = { tagName: "PartialClearX", props: {} };
    const reqY = { tagName: "PartialClearY", props: {} };

    _populateCacheForTest(55000, reqX);
    _populateCacheForTest(55000, reqY);
    expect(_getCacheSize()).toBe(2);

    // Invalidate only X
    invalidateComponentCache("PartialClearX");
    expect(_getCacheSize()).toBe(1);
    expect(_hasCachedComponentPromise(55000, reqX)).toBe(false);
    expect(_hasCachedComponentPromise(55000, reqY)).toBe(true);
  });
});

describe("RSC Types", () => {
  test("RscComponentRequest accepts all valid shapes", () => {
    // Type checking - these should all compile
    const request1: RscComponentRequest = {
      tagName: "Button",
      props: {},
    };

    const request2: RscComponentRequest = {
      tagName: "Card",
      props: { variant: "outlined", size: "large" },
      children: "<span>Hello</span>",
      elementId: "card-123",
    };

    expect(request1.tagName).toBe("Button");
    expect(request2.elementId).toBe("card-123");
  });

  test("RscRenderResult has correct structure", () => {
    const successResult: RscRenderResult = {
      element: null, // Would be ReactNode in practice
    };

    const errorResult: RscRenderResult = {
      element: null,
      error: "Something went wrong",
    };

    expect(successResult.error).toBeUndefined();
    expect(errorResult.error).toBe("Something went wrong");
  });
});
