/**
 * Sources Management Hook
 *
 * Sources come from manifest.sources[] - no separate endpoint needed.
 * Runtime only executes sync - no history/progress tracking here.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useRuntimePort, useManifest, type WorkbookSource } from "@/hooks/useWorkbook"

// Re-export for convenience
export type Source = WorkbookSource

// Available source from registry
export interface AvailableSource {
  name: string
  title: string
  description: string
  secrets: string[]
  streams: string[]
  schedule?: string
  icon?: string
}

// Sync result from runtime
export interface SyncResult {
  success: boolean
  result?: unknown
  error?: string
  missing?: string[]
  durationMs: number
}

// Add source result
export interface AddSourceResult {
  success: boolean
  filesCreated: string[]
  errors: string[]
  nextSteps: string[]
}

/**
 * Get sources from manifest
 * Sources are discovered during manifest generation
 */
export function useSources(): Source[] {
  const { data: manifest } = useManifest()
  return (manifest?.sources as Source[]) ?? []
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
      // Refresh manifest (includes sources) and db schema
      queryClient.invalidateQueries({ queryKey: ["manifest"] })
      queryClient.invalidateQueries({ queryKey: ["db-schema"] })
    },
  })
}

/**
 * List available sources from registry
 */
export function useAvailableSources() {
  const port = useRuntimePort()

  return useQuery({
    queryKey: ["available-sources", port],
    queryFn: async (): Promise<AvailableSource[]> => {
      if (!port) return []
      const res = await fetch(`http://localhost:${port}/workbook/sources/available`)
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      return data.sources ?? []
    },
    enabled: !!port,
    staleTime: 60000, // Registry doesn't change often
  })
}

/**
 * Add a source from registry to workbook
 */
export function useAddSource() {
  const port = useRuntimePort()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (sourceName: string): Promise<AddSourceResult> => {
      if (!port) throw new Error("Runtime not available")

      const res = await fetch(`http://localhost:${port}/workbook/sources/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceName }),
      })

      const data = await res.json()
      return data as AddSourceResult
    },
    onSuccess: () => {
      // Refresh manifest (includes sources)
      queryClient.invalidateQueries({ queryKey: ["manifest"] })
    },
  })
}

/**
 * Combined hook for common source operations
 */
export function useSourceManagement() {
  const { data: manifest, isLoading, error, refetch } = useManifest()
  const sources = (manifest?.sources as Source[]) ?? []
  const syncMutation = useSyncSource()
  const availableSources = useAvailableSources()
  const addMutation = useAddSource()

  return {
    // Installed sources (from manifest)
    sources,
    isLoading,
    error,

    // Available sources from registry
    availableSources: availableSources.data ?? [],
    isLoadingAvailable: availableSources.isLoading,

    // Sync mutation
    syncSource: syncMutation.mutateAsync,
    isSyncing: syncMutation.isPending,
    syncingSourceId: syncMutation.variables,
    syncResult: syncMutation.data,
    syncError: syncMutation.error,

    // Add mutation
    addSource: addMutation.mutateAsync,
    isAdding: addMutation.isPending,
    addResult: addMutation.data,
    addError: addMutation.error,

    // Refetch
    refresh: refetch,
  }
}
