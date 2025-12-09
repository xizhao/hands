/**
 * Blocks Client - Fetches rendered blocks from the runtime/worker
 */

import { useUIStore } from "@/stores/ui";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState, useEffect } from "react";

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

// ============ NOTEBOOK PERSISTENCE ============

export interface NotebookDocument {
  version: number;
  content: unknown[];
  modified: string;
}

/**
 * Load notebook.json from the runtime
 */
export async function loadNotebook(port: number): Promise<NotebookDocument> {
  const response = await fetch(`http://localhost:${port}/notebook`);
  if (!response.ok) {
    throw new Error(`Failed to load notebook: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Save notebook.json to the runtime
 */
export async function saveNotebook(
  port: number,
  content: unknown[]
): Promise<void> {
  const response = await fetch(`http://localhost:${port}/notebook`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  if (!response.ok) {
    throw new Error(`Failed to save notebook: ${response.statusText}`);
  }
}

/**
 * React hook for notebook persistence
 */
export function useNotebook() {
  const port = useUIStore((s) => s.runtimePort);
  const workbookDir = useUIStore((s) => s.activeWorkbookDirectory);

  return useQuery({
    queryKey: ["notebook", workbookDir],
    queryFn: async () => {
      if (!port) throw new Error("No runtime connected");
      return loadNotebook(port);
    },
    enabled: !!port && !!workbookDir,
    staleTime: Infinity, // Don't auto-refetch, we manage this manually
  });
}

/**
 * Hook to save notebook with debouncing
 */
export function useSaveNotebook() {
  const port = useUIStore((s) => s.runtimePort);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (content: unknown[]) => {
      if (!port) throw new Error("No runtime connected");
      await saveNotebook(port, content);
    },
    onSuccess: () => {
      // Update the local cache with new modified timestamp
      queryClient.invalidateQueries({ queryKey: ["notebook"] });
    },
  });
}

/**
 * Hook with auto-save functionality
 */
export function useNotebookAutoSave(content: unknown[], enabled = true) {
  const { mutate: save, isPending } = useSaveNotebook();
  const [lastSaved, setLastSaved] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || content.length === 0) return;

    const timer = setTimeout(() => {
      save(content, {
        onSuccess: () => {
          setLastSaved(new Date().toISOString());
        },
      });
    }, 2000); // Debounce 2 seconds

    return () => clearTimeout(timer);
  }, [content, save, enabled]);

  return { isSaving: isPending, lastSaved };
}
