/**
 * useDatabase - Consolidated database state and operations
 *
 * Combines:
 * - DB readiness from useRuntimeState
 * - Save mutation from tRPC (only available when DB is ready)
 * - Schema from useRuntimeState
 */

import { useCallback, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useRuntimeState } from "./useRuntimeState";

export interface UseDatabase {
  // State
  isReady: boolean;
  isBooting: boolean;
  schema: Array<{
    table_name: string;
    columns: Array<{ name: string; type: string; nullable: boolean }>;
  }>;
  tableCount: number;

  // Mutations (null when DB not ready)
  save: (() => void) | null;
  isSaving: boolean;
}

/**
 * Hook for database operations
 *
 * Returns save function only when DB is ready.
 * Consumers don't need to check readiness separately.
 */
export function useDatabase(): UseDatabase {
  const { isDbReady, isDbBooting, schema } = useRuntimeState();

  // tRPC mutation - only call when DB is ready
  const saveMutation = trpc.db.save.useMutation();

  // Wrap save to only work when ready
  const save = useCallback(() => {
    if (!isDbReady) {
      console.warn("[useDatabase] Cannot save - DB not ready");
      return;
    }
    saveMutation.mutate();
  }, [isDbReady, saveMutation]);

  return useMemo(
    () => ({
      isReady: isDbReady,
      isBooting: isDbBooting,
      schema,
      tableCount: schema.length,
      save: isDbReady ? save : null,
      isSaving: saveMutation.isPending,
    }),
    [isDbReady, isDbBooting, schema, save, saveMutation.isPending],
  );
}
