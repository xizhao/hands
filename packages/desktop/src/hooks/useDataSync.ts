import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRuntimePort } from "@/hooks/useWorkbook";
import { useEffect, useState } from "react";

// Types matching the runtime sync module
export type SyncFormat = "json" | "csv" | "parquet" | "postgres" | "electric" | "http-json";
export type SyncMode = "full" | "incremental" | "cdc";

export interface DataSource {
  id: string;
  name: string;
  description?: string;
  format: SyncFormat;
  url: string;
  targetTable: string;
  targetSchema?: string;
  mode: SyncMode;
  primaryKey?: string[];
  schedule?: string;
  auth?: {
    type: "none" | "bearer" | "basic" | "api-key";
    headerName?: string;
  };
  transformSql?: string;
  enabled: boolean;
  lastSyncAt?: number;
  lastSyncStatus?: "success" | "error";
  lastSyncError?: string;
  lastSyncRowCount?: number;
  createdAt: number;
  updatedAt: number;
}

export interface SyncResult {
  sourceId: string;
  success: boolean;
  rowCount: number;
  duration: number;
  error?: string;
  timestamp: number;
}

export interface SyncProgress {
  sourceId: string;
  phase: "connecting" | "fetching" | "transforming" | "loading" | "done" | "error";
  progress?: number;
  message?: string;
}

export interface BulkSyncResult {
  total: number;
  successful: number;
  failed: number;
  results: SyncResult[];
  duration: number;
}

export interface SyncHistoryEntry {
  startedAt: string;
  finishedAt: string | null;
  status: string;
  rowCount: number | null;
  error: string | null;
}

/**
 * Get the runtime API base URL
 */
function useRuntimeUrl(_workbookId: string | null) {
  const port = useRuntimePort();
  if (!port) return null;
  return `http://localhost:${port}`;
}

/**
 * Fetch all data sources
 */
export function useDataSources(workbookId: string | null) {
  const baseUrl = useRuntimeUrl(workbookId);

  return useQuery({
    queryKey: ["sync-sources", workbookId],
    queryFn: async () => {
      if (!baseUrl) throw new Error("Runtime not available");
      const res = await fetch(`${baseUrl}/sync/sources`);
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<DataSource[]>;
    },
    enabled: !!baseUrl,
    refetchInterval: 10000, // Poll for status updates
  });
}

/**
 * Get a single data source
 */
export function useDataSource(workbookId: string | null, sourceId: string | null) {
  const baseUrl = useRuntimeUrl(workbookId);

  return useQuery({
    queryKey: ["sync-source", workbookId, sourceId],
    queryFn: async () => {
      if (!baseUrl || !sourceId) throw new Error("Missing required params");
      const res = await fetch(`${baseUrl}/sync/sources/${sourceId}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<DataSource>;
    },
    enabled: !!baseUrl && !!sourceId,
  });
}

/**
 * Add a new data source
 */
export function useAddDataSource(workbookId: string | null) {
  const queryClient = useQueryClient();
  const baseUrl = useRuntimeUrl(workbookId);

  return useMutation({
    mutationFn: async ({
      source,
      secret,
    }: {
      source: Omit<DataSource, "id" | "createdAt" | "updatedAt">;
      secret?: string;
    }) => {
      if (!baseUrl) throw new Error("Runtime not available");
      const res = await fetch(`${baseUrl}/sync/sources`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source, secret }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<DataSource>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sync-sources", workbookId] });
    },
  });
}

/**
 * Update a data source
 */
export function useUpdateDataSource(workbookId: string | null) {
  const queryClient = useQueryClient();
  const baseUrl = useRuntimeUrl(workbookId);

  return useMutation({
    mutationFn: async ({
      sourceId,
      updates,
      secret,
    }: {
      sourceId: string;
      updates: Partial<DataSource>;
      secret?: string;
    }) => {
      if (!baseUrl) throw new Error("Runtime not available");
      const res = await fetch(`${baseUrl}/sync/sources/${sourceId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates, secret }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<DataSource>;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["sync-sources", workbookId] });
      queryClient.invalidateQueries({ queryKey: ["sync-source", workbookId, variables.sourceId] });
    },
  });
}

/**
 * Delete a data source
 */
export function useDeleteDataSource(workbookId: string | null) {
  const queryClient = useQueryClient();
  const baseUrl = useRuntimeUrl(workbookId);

  return useMutation({
    mutationFn: async (sourceId: string) => {
      if (!baseUrl) throw new Error("Runtime not available");
      const res = await fetch(`${baseUrl}/sync/sources/${sourceId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (_, sourceId) => {
      queryClient.invalidateQueries({ queryKey: ["sync-sources", workbookId] });
      queryClient.removeQueries({ queryKey: ["sync-source", workbookId, sourceId] });
    },
  });
}

/**
 * Sync a single source
 */
export function useSyncSource(workbookId: string | null) {
  const queryClient = useQueryClient();
  const baseUrl = useRuntimeUrl(workbookId);

  return useMutation({
    mutationFn: async (sourceId: string) => {
      if (!baseUrl) throw new Error("Runtime not available");
      const res = await fetch(`${baseUrl}/sync/sources/${sourceId}/sync`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<SyncResult>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sync-sources", workbookId] });
    },
  });
}

/**
 * Cancel an in-progress sync
 */
export function useCancelSync(workbookId: string | null) {
  const baseUrl = useRuntimeUrl(workbookId);

  return useMutation({
    mutationFn: async (sourceId: string) => {
      if (!baseUrl) throw new Error("Runtime not available");
      const res = await fetch(`${baseUrl}/sync/sources/${sourceId}/cancel`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<{ cancelled: boolean }>;
    },
  });
}

/**
 * Sync all or specific sources
 */
export function useBulkSync(workbookId: string | null) {
  const queryClient = useQueryClient();
  const baseUrl = useRuntimeUrl(workbookId);

  return useMutation({
    mutationFn: async ({
      sourceIds,
      concurrency,
    }: {
      sourceIds?: string[];
      concurrency?: number;
    } = {}) => {
      if (!baseUrl) throw new Error("Runtime not available");
      const res = await fetch(`${baseUrl}/sync/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceIds, concurrency }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<BulkSyncResult>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sync-sources", workbookId] });
    },
  });
}

/**
 * Get sync history for a source
 */
export function useSyncHistory(workbookId: string | null, sourceId: string | null, limit = 50) {
  const baseUrl = useRuntimeUrl(workbookId);

  return useQuery({
    queryKey: ["sync-history", workbookId, sourceId, limit],
    queryFn: async () => {
      if (!baseUrl || !sourceId) throw new Error("Missing required params");
      const res = await fetch(`${baseUrl}/sync/sources/${sourceId}/history?limit=${limit}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<SyncHistoryEntry[]>;
    },
    enabled: !!baseUrl && !!sourceId,
  });
}

/**
 * Subscribe to real-time sync progress updates via SSE
 */
export function useSyncProgress(workbookId: string | null) {
  const baseUrl = useRuntimeUrl(workbookId);
  const [progress, setProgress] = useState<Map<string, SyncProgress>>(new Map());

  useEffect(() => {
    if (!baseUrl) return;

    const eventSource = new EventSource(`${baseUrl}/sync/progress`);

    eventSource.onmessage = (event) => {
      const update = JSON.parse(event.data) as SyncProgress;
      setProgress((prev) => {
        const next = new Map(prev);
        if (update.phase === "done" || update.phase === "error") {
          // Remove completed/errored syncs after a delay
          setTimeout(() => {
            setProgress((p) => {
              const n = new Map(p);
              n.delete(update.sourceId);
              return n;
            });
          }, 3000);
        }
        next.set(update.sourceId, update);
        return next;
      });
    };

    eventSource.onerror = () => {
      // Connection lost, will auto-reconnect
    };

    return () => {
      eventSource.close();
    };
  }, [baseUrl]);

  return {
    progress,
    getProgress: (sourceId: string) => progress.get(sourceId),
    isSyncing: (sourceId: string) => {
      const p = progress.get(sourceId);
      return p && p.phase !== "done" && p.phase !== "error";
    },
  };
}

/**
 * Combined hook for common sync operations
 */
export function useDataSync(workbookId: string | null) {
  const sources = useDataSources(workbookId);
  const addSource = useAddDataSource(workbookId);
  const updateSource = useUpdateDataSource(workbookId);
  const deleteSource = useDeleteDataSource(workbookId);
  const syncSource = useSyncSource(workbookId);
  const cancelSync = useCancelSync(workbookId);
  const bulkSync = useBulkSync(workbookId);
  const { progress, getProgress, isSyncing } = useSyncProgress(workbookId);

  return {
    // Data
    sources: sources.data ?? [],
    isLoading: sources.isLoading,
    error: sources.error,

    // Progress tracking
    progress,
    getProgress,
    isSyncing,

    // Mutations
    addSource: addSource.mutateAsync,
    updateSource: updateSource.mutateAsync,
    deleteSource: deleteSource.mutateAsync,
    syncSource: syncSource.mutateAsync,
    cancelSync: cancelSync.mutateAsync,
    syncAll: (concurrency?: number) => bulkSync.mutateAsync({ concurrency }),
    syncSelected: (sourceIds: string[], concurrency?: number) =>
      bulkSync.mutateAsync({ sourceIds, concurrency }),

    // Mutation states
    isAdding: addSource.isPending,
    isUpdating: updateSource.isPending,
    isDeleting: deleteSource.isPending,
    isBulkSyncing: bulkSync.isPending,

    // Refetch
    refresh: sources.refetch,
  };
}
