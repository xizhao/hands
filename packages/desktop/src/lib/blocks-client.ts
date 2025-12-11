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

import { useRuntimePort } from "@/hooks/useWorkbook";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, use } from "react";
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
 *
 * Uses useRuntimePort() for ready state - blocks won't fetch until runtime is ready.
 * This allows pages to load instantly while blocks show "waiting" state.
 */
export function useBlock(blockId: string | null, props?: Record<string, unknown>) {
  // Get port from store
  const port = useRuntimePort();
  const queryClient = useQueryClient();

  const query = useQuery({
    // Include port in cache key to avoid stale data when switching notebooks
    queryKey: ["block", port, blockId, props],
    queryFn: async () => {
      if (!blockId || !port) {
        return { element: null, error: "Not ready" };
      }
      return fetchBlock(port, blockId, props);
    },
    // Only fetch when runtime is ready
    enabled: !!blockId && !!port && !!port,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const invalidate = useCallback(() => {
    if (blockId && port) {
      // Clear promise cache
      const cacheKey = `${port}:${blockId}:${JSON.stringify(props)}`;
      blockPromiseCache.delete(cacheKey);

      // Invalidate React Query cache (include port in key)
      queryClient.invalidateQueries({
        queryKey: ["block", port, blockId],
      });
    }
  }, [blockId, port, props, queryClient]);

  return {
    ...query,
    invalidate,
    // Expose runtime readiness for UI to show different loading states
    runtimeReady: !!port,
    isWaitingForRuntime: !port && !!blockId,
  };
}

/**
 * Suspense-compatible block hook
 * Use this inside a Suspense boundary for streaming
 */
export function useBlockSuspense(blockId: string, props?: Record<string, unknown>): ReactNode {
  const port = useRuntimePort();

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
  const port = useRuntimePort();
  const queryClient = useQueryClient();

  const fetch = useCallback(
    async (blockId: string, props?: Record<string, unknown>): Promise<BlockRenderResult> => {
      if (!port) {
        return { element: null, error: "No runtime connected" };
      }

      const result = await fetchBlock(port, blockId, props);

      // Update cache (include port in key)
      queryClient.setQueryData(["block", port, blockId, props], result);

      return result;
    },
    [port, queryClient]
  );

  const invalidate = useCallback(
    (blockId: string) => {
      queryClient.invalidateQueries({
        predicate: (query) =>
          query.queryKey[0] === "block" && query.queryKey[1] === port && query.queryKey[2] === blockId,
      });
    },
    [port, queryClient]
  );

  return { fetch, invalidate };
}

// ============================================
// Block Source API - for visual block editor
// ============================================

export interface BlockSourceResult {
  success: boolean;
  blockId: string;
  filePath?: string;
  source?: string;
  error?: string;
}

/**
 * Fetch block source code
 */
export async function fetchBlockSource(
  port: number,
  blockId: string
): Promise<BlockSourceResult> {
  try {
    const response = await fetch(`http://localhost:${port}/workbook/blocks/${blockId}/source`);
    return await response.json();
  } catch (error) {
    return {
      success: false,
      blockId,
      error: String(error),
    };
  }
}

/**
 * Save block source code
 */
export async function saveBlockSource(
  port: number,
  blockId: string,
  source: string
): Promise<BlockSourceResult> {
  try {
    const response = await fetch(`http://localhost:${port}/workbook/blocks/${blockId}/source`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source }),
    });
    return await response.json();
  } catch (error) {
    return {
      success: false,
      blockId,
      error: String(error),
    };
  }
}

/**
 * Create a new block
 */
export async function createBlock(
  port: number,
  blockId: string,
  source?: string
): Promise<BlockSourceResult> {
  try {
    const response = await fetch(`http://localhost:${port}/workbook/blocks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blockId, source }),
    });
    return await response.json();
  } catch (error) {
    return {
      success: false,
      blockId,
      error: String(error),
    };
  }
}

/**
 * Delete a block
 */
export async function deleteBlock(
  port: number,
  blockId: string
): Promise<BlockSourceResult> {
  try {
    const response = await fetch(`http://localhost:${port}/workbook/blocks/${blockId}`, {
      method: "DELETE",
    });
    return await response.json();
  } catch (error) {
    return {
      success: false,
      blockId,
      error: String(error),
    };
  }
}

/**
 * Move/rename a block (updates imports automatically)
 */
export interface MoveBlockResult {
  success: boolean;
  from?: string;
  to?: string;
  message?: string;
  error?: string;
}

export async function moveBlock(
  port: number,
  from: string,
  to: string
): Promise<MoveBlockResult> {
  try {
    const response = await fetch(`http://localhost:${port}/workbook/blocks/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from, to }),
    });
    return await response.json();
  } catch (error) {
    return {
      success: false,
      error: String(error),
    };
  }
}

/**
 * React hook for fetching block source code
 */
export function useBlockSource(blockId: string | null) {
  const port = useRuntimePort();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["blockSource", port, blockId],
    queryFn: async () => {
      if (!blockId || !port) {
        return { success: false, blockId: blockId ?? "", error: "Not ready" };
      }
      return fetchBlockSource(port, blockId);
    },
    enabled: !!blockId && !!port,
    staleTime: 5_000, // Shorter stale time for source code
    refetchOnWindowFocus: false,
  });

  const save = useCallback(
    async (source: string) => {
      if (!blockId || !port) {
        return { success: false, blockId: blockId ?? "", error: "Not ready" };
      }

      const result = await saveBlockSource(port, blockId, source);

      if (result.success) {
        // Update cache
        queryClient.setQueryData(["blockSource", port, blockId], {
          ...result,
          source,
        });

        // Invalidate rendered block cache to refresh preview
        queryClient.invalidateQueries({
          queryKey: ["block", port, blockId],
        });
      }

      return result;
    },
    [blockId, port, queryClient]
  );

  const invalidate = useCallback(() => {
    if (blockId && port) {
      queryClient.invalidateQueries({
        queryKey: ["blockSource", port, blockId],
      });
    }
  }, [blockId, port, queryClient]);

  return {
    ...query,
    save,
    invalidate,
    source: query.data?.source,
    filePath: query.data?.filePath,
  };
}

/**
 * React hook for moving/renaming blocks
 */
export function useMoveBlock() {
  const port = useRuntimePort();
  const queryClient = useQueryClient();

  const move = useCallback(
    async (from: string, to: string): Promise<MoveBlockResult> => {
      if (!port) {
        return { success: false, error: "No runtime connected" };
      }

      const result = await moveBlock(port, from, to);

      if (result.success) {
        // Invalidate manifest to refresh block list
        queryClient.invalidateQueries({ queryKey: ["manifest"] });
        // Invalidate old block caches
        queryClient.invalidateQueries({ queryKey: ["block", port, from] });
        queryClient.invalidateQueries({ queryKey: ["blockSource", port, from] });
      }

      return result;
    },
    [port, queryClient]
  );

  return { move, isReady: !!port };
}

