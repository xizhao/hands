/**
 * Sources Management Hook
 *
 * Simplified React Query hooks for sources.
 * Runtime only executes sync - no history/progress tracking here.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useRuntimePort } from "@/hooks/useWorkbook"

// Source from runtime API (installed)
export interface Source {
  id: string
  name: string
  title: string
  description: string
  schedule?: string
  secrets: string[]
  missingSecrets: string[]
}

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
      // Refresh sources list
      queryClient.invalidateQueries({ queryKey: ["sources"] })
    },
  })
}

/**
 * Combined hook for common source operations
 */
export function useSourceManagement() {
  const sources = useSources()
  const syncMutation = useSyncSource()
  const availableSources = useAvailableSources()
  const addMutation = useAddSource()

  return {
    // Installed sources
    sources: sources.data ?? [],
    isLoading: sources.isLoading,
    error: sources.error,

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
    refresh: sources.refetch,
  }
}
