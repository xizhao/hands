/**
 * usePersistence - Platform-agnostic persistence hook
 *
 * Abstracts save/version operations:
 * - Desktop: Git-backed versioning with full history
 * - Web: Auto-save with no history (OPFS)
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { HistoryEntry, PersistenceStatus, SaveResult } from "../platform/types";
import { usePlatform } from "../platform";

// ============================================================================
// Status Hook
// ============================================================================

/**
 * Get current persistence status (hasChanges, lastSaved, sync info)
 */
export function usePersistenceStatus() {
  const platform = usePlatform();

  return useQuery({
    queryKey: ["persistence-status"],
    queryFn: async (): Promise<PersistenceStatus> => {
      return platform.persistence.getStatus();
    },
    staleTime: 5_000,
    refetchInterval: 10_000,
  });
}

// ============================================================================
// Save Hook
// ============================================================================

/**
 * Save current state with optional message
 */
export function useSave() {
  const platform = usePlatform();
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["persistence-save"],
    mutationFn: async (message?: string): Promise<SaveResult | null> => {
      return platform.persistence.save(message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["persistence-status"] });
      queryClient.invalidateQueries({ queryKey: ["persistence-history"] });
    },
  });
}

// ============================================================================
// History Hook
// ============================================================================

/**
 * Get save history (commits on desktop, empty on web)
 */
export function usePersistenceHistory(limit = 50) {
  const platform = usePlatform();

  return useQuery({
    queryKey: ["persistence-history", limit],
    queryFn: async (): Promise<HistoryEntry[]> => {
      return platform.persistence.getHistory(limit);
    },
    staleTime: 30_000,
  });
}

// ============================================================================
// Revert Hook
// ============================================================================

/**
 * Revert to a previous state
 */
export function useRevert() {
  const platform = usePlatform();
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["persistence-revert"],
    mutationFn: async (entryId: string): Promise<void> => {
      return platform.persistence.revert(entryId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["persistence-status"] });
      queryClient.invalidateQueries({ queryKey: ["persistence-history"] });
    },
  });
}

// ============================================================================
// Sync Hooks (optional - only available on platforms with sync)
// ============================================================================

/**
 * Check if sync is available on this platform
 */
export function useSyncAvailable() {
  const platform = usePlatform();
  return !!platform.persistence.sync;
}

/**
 * Push local changes to remote
 */
export function usePush() {
  const platform = usePlatform();
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["persistence-push"],
    mutationFn: async (): Promise<void> => {
      if (!platform.persistence.sync) {
        throw new Error("Sync not available on this platform");
      }
      return platform.persistence.sync.push();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["persistence-status"] });
    },
  });
}

/**
 * Pull remote changes
 */
export function usePull() {
  const platform = usePlatform();
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["persistence-pull"],
    mutationFn: async (): Promise<void> => {
      if (!platform.persistence.sync) {
        throw new Error("Sync not available on this platform");
      }
      return platform.persistence.sync.pull();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["persistence-status"] });
      queryClient.invalidateQueries({ queryKey: ["persistence-history"] });
    },
  });
}

/**
 * Get remote URL
 */
export function useRemote() {
  const platform = usePlatform();

  return useQuery({
    queryKey: ["persistence-remote"],
    queryFn: async (): Promise<string | null> => {
      if (!platform.persistence.sync) {
        return null;
      }
      return platform.persistence.sync.getRemote();
    },
    enabled: !!platform.persistence.sync,
    staleTime: 60_000,
  });
}

/**
 * Set remote URL
 */
export function useSetRemote() {
  const platform = usePlatform();
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["persistence-set-remote"],
    mutationFn: async (url: string): Promise<void> => {
      if (!platform.persistence.sync) {
        throw new Error("Sync not available on this platform");
      }
      return platform.persistence.sync.setRemote(url);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["persistence-status"] });
      queryClient.invalidateQueries({ queryKey: ["persistence-remote"] });
    },
  });
}

// ============================================================================
// Convenience: Combined Hook
// ============================================================================

/**
 * Combined persistence state and actions
 */
export function usePersistence() {
  const status = usePersistenceStatus();
  const save = useSave();
  const history = usePersistenceHistory(10);
  const syncAvailable = useSyncAvailable();

  return {
    // Status
    status: status.data,
    isLoading: status.isLoading,
    hasChanges: status.data?.hasChanges ?? false,
    lastSaved: status.data?.lastSaved ?? null,
    canSync: status.data?.canSync ?? false,

    // Actions
    save: save.mutate,
    saveAsync: save.mutateAsync,
    isSaving: save.isPending,

    // History
    history: history.data ?? [],
    isLoadingHistory: history.isLoading,

    // Sync
    syncAvailable,
    remote: status.data?.remote,
  };
}
