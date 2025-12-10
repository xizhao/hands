/**
 * Blocks Client - RSC Flight Wire Format
 *
 * Fetches and renders blocks using React Server Components.
 * Each block is a full reactive app with client-side hydration.
 *
 * Flow:
 * 1. Fetch Flight stream from /blocks/:id/rsc
 * 2. Parse with createFromReadableStream
 * 3. Render React element with Suspense
 */

import { useUIStore } from "@/stores/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState, useEffect, use } from "react";
import type { ReactNode } from "react";

// @ts-ignore - react-server-dom-webpack/client lacks type definitions
import { createFromReadableStream } from "react-server-dom-webpack/client";

// Block render result - now returns React element, not HTML
export interface BlockRenderResult {
  element: ReactNode | null;
  error?: string;
}


/**
 * Fetch RSC Flight stream and parse into React element
 */
export async function fetchBlock(
  port: number,
  blockId: string,
  props?: Record<string, unknown>
): Promise<BlockRenderResult> {
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

  try {
    const response = await fetch(url);

    if (!response.ok) {
      return { element: null, error: `Fetch failed: ${response.statusText}` };
    }

    // Check content type
    const contentType = response.headers.get("Content-Type");
    if (!contentType?.includes("text/x-component")) {
      // Fallback: server returned something else
      const text = await response.text();
      return { element: null, error: `Expected Flight format, got ${contentType}` };
    }

    // Parse Flight stream into React element
    const stream = response.body;
    if (!stream) {
      return { element: null, error: "No response body" };
    }

    const element = await createFromReadableStream(stream);
    return { element };
  } catch (error) {
    console.error("[blocks] Fetch error:", error);
    return { element: null, error: String(error) };
  }
}

/**
 * Create a cached Flight stream reader
 * This allows React Suspense to work properly
 */
function createBlockPromise(
  port: number,
  blockId: string,
  props?: Record<string, unknown>
): Promise<ReactNode> {
  const searchParams = new URLSearchParams();
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value !== undefined) {
        searchParams.set(key, typeof value === "string" ? value : JSON.stringify(value));
      }
    }
  }

  const url = `http://localhost:${port}/blocks/${blockId}?${searchParams}`;

  return fetch(url).then(async (response) => {
    if (!response.ok) {
      throw new Error(`Fetch failed: ${response.statusText}`);
    }

    const stream = response.body;
    if (!stream) {
      throw new Error("No response body");
    }

    return createFromReadableStream(stream);
  });
}

// Cache for block promises (for Suspense)
const blockPromiseCache = new Map<string, Promise<ReactNode>>();

/**
 * Get or create a cached block promise
 */
function getBlockPromise(
  port: number,
  blockId: string,
  props?: Record<string, unknown>
): Promise<ReactNode> {
  const cacheKey = `${port}:${blockId}:${JSON.stringify(props)}`;

  let promise = blockPromiseCache.get(cacheKey);
  if (!promise) {
    promise = createBlockPromise(port, blockId, props);
    blockPromiseCache.set(cacheKey, promise);

    // Clear from cache after resolve/reject for fresh data on next request
    promise.finally(() => {
      setTimeout(() => blockPromiseCache.delete(cacheKey), 30000);
    });
  }

  return promise;
}

/**
 * React hook for RSC block rendering
 * Returns a React element that can be rendered directly
 */
export function useBlock(blockId: string | null, props?: Record<string, unknown>) {
  const port = useUIStore((s) => s.runtimePort);
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["block", blockId, props],
    queryFn: async () => {
      if (!blockId || !port) {
        return { element: null, error: "Not ready" };
      }
      return fetchBlock(port, blockId, props);
    },
    enabled: !!blockId && !!port,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const invalidate = useCallback(() => {
    if (blockId) {
      // Clear promise cache
      const cacheKey = `${port}:${blockId}:${JSON.stringify(props)}`;
      blockPromiseCache.delete(cacheKey);

      // Invalidate React Query cache
      queryClient.invalidateQueries({
        queryKey: ["block", blockId],
      });
    }
  }, [blockId, port, props, queryClient]);

  return {
    ...query,
    invalidate,
  };
}

/**
 * Suspense-compatible block hook
 * Use this inside a Suspense boundary for streaming
 */
export function useBlockSuspense(blockId: string, props?: Record<string, unknown>): ReactNode {
  const port = useUIStore((s) => s.runtimePort);

  if (!port) {
    throw new Error("Runtime not connected");
  }

  const promise = getBlockPromise(port, blockId, props);
  return use(promise);
}

/**
 * Manual block fetching (for imperative use)
 */
export function useBlockFetcher() {
  const port = useUIStore((s) => s.runtimePort);
  const queryClient = useQueryClient();

  const fetch = useCallback(
    async (blockId: string, props?: Record<string, unknown>): Promise<BlockRenderResult> => {
      if (!port) {
        return { element: null, error: "No runtime connected" };
      }

      const result = await fetchBlock(port, blockId, props);

      // Update cache
      queryClient.setQueryData(["block", blockId, props], result);

      return result;
    },
    [port, queryClient]
  );

  const invalidate = useCallback(
    (blockId: string) => {
      queryClient.invalidateQueries({
        predicate: (query) =>
          query.queryKey[0] === "block" && query.queryKey[1] === blockId,
      });
    },
    [queryClient]
  );

  return { fetch, invalidate };
}

