/**
 * Blocks Client - Fetches rendered blocks from the runtime/worker
 */

import { useUIStore } from "@/stores/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

// Block configuration that gets sent to the worker
export interface BlockConfig {
  id: string;
  type: "sql" | "chart" | "text" | "table";
  props: Record<string, unknown>;
}

// Simple block render request (for discovered blocks)
export interface BlockRenderRequest {
  id: string;
  props?: Record<string, unknown>;
}

// Block render result
export interface BlockRenderResult {
  html: string;
  error?: string;
}

/**
 * Fetch a rendered block from the worker
 */
export async function renderBlock(
  port: number,
  block: BlockConfig
): Promise<BlockRenderResult> {
  try {
    const response = await fetch(`http://localhost:${port}/blocks/render-fragment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(block),
    });

    const html = await response.text();

    if (!response.ok) {
      return { html: "", error: `Render failed: ${response.statusText}` };
    }

    return { html };
  } catch (error) {
    return { html: "", error: String(error) };
  }
}

/**
 * React hook to render a block
 */
export function useRenderBlock(block: BlockConfig | null) {
  const port = useUIStore((s) => s.runtimePort);

  return useQuery({
    queryKey: ["block-render", block?.id, block?.props],
    queryFn: async () => {
      if (!block || !port) return { html: "", error: "Not ready" };
      return renderBlock(port, block);
    },
    enabled: !!block && !!port,
    staleTime: 30_000, // Cache for 30 seconds
    refetchOnWindowFocus: false,
  });
}

/**
 * Manual block rendering hook (for explicit refresh)
 */
export function useBlockRenderer() {
  const port = useUIStore((s) => s.runtimePort);
  const queryClient = useQueryClient();

  const render = useCallback(
    async (block: BlockConfig): Promise<BlockRenderResult> => {
      if (!port) return { html: "", error: "No runtime connected" };
      const result = await renderBlock(port, block);
      // Update the cache
      queryClient.setQueryData(["block-render", block.id, block.props], result);
      return result;
    },
    [port, queryClient]
  );

  const invalidate = useCallback(
    (blockId: string) => {
      queryClient.invalidateQueries({
        predicate: (query) =>
          query.queryKey[0] === "block-render" && query.queryKey[1] === blockId,
      });
    },
    [queryClient]
  );

  return { render, invalidate };
}

/**
 * Render a discovered block by ID
 * This is simpler than BlockConfig - just pass the block ID and optional props
 */
export async function renderBlockById(
  port: number,
  blockId: string,
  props?: Record<string, unknown>
): Promise<BlockRenderResult> {
  // Build URL with props as query params if provided
  const baseUrl = `http://localhost:${port}/blocks/${blockId}`;
  const url = props && Object.keys(props).length > 0
    ? `${baseUrl}?props=${encodeURIComponent(JSON.stringify(props))}`
    : baseUrl;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      return { html: "", error: `Render failed: ${response.statusText}` };
    }

    const html = await response.text();
    return { html };
  } catch (error) {
    console.error("[blocks] Fetch error:", error);
    return { html: "", error: String(error) };
  }
}

/**
 * React hook to render a discovered block by ID
 */
export function useBlockById(blockId: string | null, props?: Record<string, unknown>) {
  const port = useUIStore((s) => s.runtimePort);

  return useQuery({
    queryKey: ["block", blockId, props],
    queryFn: async () => {
      if (!blockId || !port) return { html: "", error: "Not ready" };
      return renderBlockById(port, blockId, props);
    },
    enabled: !!blockId && !!port,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}

