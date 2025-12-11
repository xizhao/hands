/**
 * Sources Management Hook
 *
 * Simplified React Query hooks for sources.
 * Runtime only executes sync - no history/progress tracking here.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useRuntimePort } from "@/hooks/useWorkbook"

// Source from runtime API
export interface Source {
  id: string
  name: string
  title: string
  description: string
  schedule?: string
  secrets: string[]
  missingSecrets: string[]
}

// Sync result from runtime
export interface SyncResult {
  success: boolean
  result?: unknown
  error?: string
  missing?: string[]
  durationMs: number
}

/**
 * List all installed sources
 */
export function useSources() {
  const port = useRuntimePort()

  return useQuery({
    queryKey: ["sources", port],
    queryFn: async (): Promise<Source[]> => {
      if (!port) return []
      const res = await fetch(`http://localhost:${port}/sources`)
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      return data.sources ?? []
    },
    enabled: !!port,
    staleTime: 5000,
  })
}

/**
 * Trigger sync for a source
 * Returns the sync result when complete
 */
export function useSyncSource() {
  const port = useRuntimePort()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (sourceId: string): Promise<SyncResult> => {
      if (!port) throw new Error("Runtime not available")

      const res = await fetch(`http://localhost:${port}/sources/${sourceId}/sync`, {
        method: "POST",
      })

      const data = await res.json()

      // Return the result even if not successful (for error display)
      return data as SyncResult
    },
    onSuccess: () => {
      // Refresh sources list and db schema
      queryClient.invalidateQueries({ queryKey: ["sources"] })
      queryClient.invalidateQueries({ queryKey: ["db-schema"] })
    },
  })
}

/**
 * Combined hook for common source operations
 */
export function useSourceManagement() {
  const sources = useSources()
  const syncMutation = useSyncSource()

  return {
    // Data
    sources: sources.data ?? [],
    isLoading: sources.isLoading,
    error: sources.error,

    // Sync mutation
    syncSource: syncMutation.mutateAsync,
    isSyncing: syncMutation.isPending,
    syncingSourceId: syncMutation.variables,
    syncResult: syncMutation.data,
    syncError: syncMutation.error,

    // Refetch
    refresh: sources.refetch,
  }
}
