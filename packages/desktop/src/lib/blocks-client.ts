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

