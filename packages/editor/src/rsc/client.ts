/**
 * RSC Client - Flight Wire Format Consumer
 *
 * Fetches and parses Flight streams from the runtime worker
 * to render arbitrary React components in the editor.
 */

import type { ReactNode } from "react";
import type { RscComponentRequest, RscRenderResult } from "./types";

// Lazy import for react-server-dom-webpack/client
// This is loaded dynamically to avoid build issues when not available
let createFromReadableStream: ((stream: ReadableStream) => Promise<ReactNode>) | null = null;

/**
 * Initialize the Flight client
 * Call this once at app startup
 */
export async function initFlightClient(): Promise<boolean> {
  if (createFromReadableStream) return true;

  try {
    // @ts-expect-error - module lacks types
    const mod = await import("react-server-dom-webpack/client");
    createFromReadableStream = mod.createFromReadableStream;
    return true;
  } catch (err) {
    console.warn("[rsc] Failed to load Flight client:", err);
    return false;
  }
}

/**
 * Render a component via RSC
 *
 * @param port - Runtime worker port (e.g., 55200)
 * @param request - Component render request
 * @returns Rendered React element or error
 */
export async function renderComponentViaRsc(
  port: number,
  request: RscComponentRequest,
): Promise<RscRenderResult> {
  if (!createFromReadableStream) {
    const initialized = await initFlightClient();
    if (!initialized) {
      return { element: null, error: "Flight client not available" };
    }
  }

  // NOTE: setRuntimePort should be called ONCE at app startup
  // setRuntimePort(port) -- don't override here

  const { tagName, props, children, elementId } = request;

  // Build request body
  const body = JSON.stringify({
    tagName,
    props,
    children,
    elementId,
  });

  try {
    const response = await fetch(`http://localhost:${port}/rsc/component`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body,
    });

    if (!response.ok) {
      // Try to get detailed error from response body
      let errorMessage = `RSC render failed: ${response.statusText}`;
      try {
        const contentType = response.headers.get("Content-Type") || "";
        if (contentType.includes("application/json")) {
          const errorData = await response.json();
          errorMessage = errorData.error || errorData.message || errorMessage;
          if (errorData.stack) {
            errorMessage += `\n${errorData.stack.split("\n").slice(0, 3).join("\n")}`;
          }
        } else {
          const text = await response.text();
          const match = text.match(/Error:?\s*([^\n<]+)/i);
          if (match) {
            errorMessage = match[1].trim();
          } else if (text.length < 500) {
            errorMessage = text.trim() || errorMessage;
          }
        }
      } catch {
        // Fallback to status text
      }
      return { element: null, error: errorMessage };
    }

    // Check content type
    const contentType = response.headers.get("Content-Type");
    if (!contentType?.includes("text/x-component")) {
      return {
        element: null,
        error: `Expected Flight format, got ${contentType}`,
      };
    }

    const stream = response.body;
    if (!stream) {
      return { element: null, error: "No response body" };
    }

    // Parse Flight stream
    const element = await createFromReadableStream?.(stream);
    return { element };
  } catch (err) {
    console.error("[rsc] Render error:", err);
    return {
      element: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Render a block via RSC (existing block system)
 *
 * @param port - Runtime worker port
 * @param blockId - Block ID to render
 * @param props - Block props
 * @param retries - Number of retries for connection errors (worker booting)
 */
export async function renderBlockViaRsc(
  port: number,
  blockId: string,
  props?: Record<string, unknown>,
  retries = 5,
): Promise<RscRenderResult> {
  if (!createFromReadableStream) {
    const initialized = await initFlightClient();
    if (!initialized) {
      return { element: null, error: "Flight client not available" };
    }
  }

  // NOTE: setRuntimePort should be called ONCE at app startup, not here.
  // The runtime port (for vite-proxy) may differ from the worker port (for RSC blocks).
  // setRuntimePort(port) -- don't override here

  // Build URL with props as query params
  const searchParams = new URLSearchParams();
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value !== undefined) {
        searchParams.set(key, typeof value === "string" ? value : JSON.stringify(value));
      }
    }
  }

  const url = `http://localhost:${port}/blocks/${blockId}?${searchParams}`;

  // Retry loop for connection errors (worker still booting)
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url);

      if (!response.ok) {
        // Check if server is still booting (503 with booting flag)
        if (response.status === 503) {
          try {
            const errorData = await response.json();
            if (errorData.booting && attempt < retries) {
              // Worker is booting, wait and retry
              console.log(`[rsc] Worker booting, retry ${attempt + 1}/${retries}...`);
              await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
              continue;
            }
          } catch {
            // Not JSON, fall through to error handling
          }
        }

        // Try to get detailed error from response body
        let errorMessage = `Fetch failed: ${response.statusText}`;
        try {
          const contentType = response.headers.get("Content-Type") || "";
          if (contentType.includes("application/json")) {
            const errorData = await response.json();
            // Handle various JSON error formats
            errorMessage = errorData.error || errorData.message || errorMessage;
            // Include blockServerError if present (from runtime proxy)
            if (errorData.blockServerError) {
              errorMessage = errorData.blockServerError;
            }
            if (errorData.stack) {
              errorMessage += `\n${errorData.stack.split("\n").slice(0, 3).join("\n")}`;
            }
          } else {
            // Vite often returns HTML or plain text errors
            const text = await response.text();
            // Extract module resolution errors first (most specific)
            const moduleMatch = text.match(/Cannot find module ['"]([^'"]+)['"]/);
            if (moduleMatch) {
              errorMessage = `Cannot find module '${moduleMatch[1]}'`;
            } else {
              // Extract error message from Vite error page or plain text
              const match = text.match(/Error:?\s*([^\n<]+)/i);
              if (match) {
                errorMessage = match[1].trim();
              } else if (text.length < 500) {
                errorMessage = text.trim() || errorMessage;
              }
            }
          }
        } catch {
          // Fallback to status text if we can't parse the body
        }
        return { element: null, error: errorMessage };
      }

      const contentType = response.headers.get("Content-Type");
      if (!contentType?.includes("text/x-component")) {
        return {
          element: null,
          error: `Expected Flight format, got ${contentType}`,
        };
      }

      const stream = response.body;
      if (!stream) {
        return { element: null, error: "No response body" };
      }

      const element = await createFromReadableStream?.(stream);
      return { element };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      // Connection refused = worker not ready yet, retry
      const isConnectionError =
        lastError.message.includes("Load failed") ||
        lastError.message.includes("fetch failed") ||
        lastError.message.includes("ECONNREFUSED") ||
        lastError.message.includes("NetworkError");

      if (isConnectionError && attempt < retries) {
        console.log(`[rsc] Connection failed, retry ${attempt + 1}/${retries}...`);
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }

      // Non-retryable error or out of retries
      console.error("[rsc] Block render error:", err);
      return {
        element: null,
        error: lastError.message,
      };
    }
  }

  // Exhausted retries
  return {
    element: null,
    error: lastError?.message || "Failed to connect to block server",
  };
}

// Promise cache for Suspense support
const componentCache = new Map<string, Promise<ReactNode>>();

/**
 * Get cached component promise for Suspense
 */
export function getCachedComponentPromise(
  port: number,
  request: RscComponentRequest,
): Promise<ReactNode> {
  const cacheKey = `${port}:${request.tagName}:${JSON.stringify(request.props)}`;

  let promise = componentCache.get(cacheKey);
  if (!promise) {
    promise = renderComponentViaRsc(port, request).then((result) => {
      if (result.error) throw new Error(result.error);
      return result.element!;
    });
    componentCache.set(cacheKey, promise);

    // Clear cache after 30s
    promise.finally(() => {
      setTimeout(() => componentCache.delete(cacheKey), 30000);
    });
  }

  return promise;
}

/**
 * Invalidate component cache
 */
export function invalidateComponentCache(tagName?: string): void {
  if (tagName) {
    // Invalidate specific component
    for (const key of componentCache.keys()) {
      if (key.includes(`:${tagName}:`)) {
        componentCache.delete(key);
      }
    }
  } else {
    // Invalidate all
    componentCache.clear();
  }
}

/**
 * For testing: Check if a cache key exists
 * @internal
 */
export function _hasCachedComponentPromise(port: number, request: RscComponentRequest): boolean {
  const cacheKey = `${port}:${request.tagName}:${JSON.stringify(request.props)}`;
  return componentCache.has(cacheKey);
}

/**
 * For testing: Get cache size
 * @internal
 */
export function _getCacheSize(): number {
  return componentCache.size;
}

/**
 * For testing: Populate cache without creating a throwing promise
 * This lets us test cache behavior without triggering Suspense semantics
 * @internal
 */
export function _populateCacheForTest(port: number, request: RscComponentRequest): void {
  const cacheKey = `${port}:${request.tagName}:${JSON.stringify(request.props)}`;
  if (!componentCache.has(cacheKey)) {
    // Create a promise that never settles (for testing cache mechanics only)
    componentCache.set(cacheKey, new Promise(() => {}));
  }
}
