/**
 * useDatabase - Consolidated database state and operations
 *
 * Combines:
 * - DB readiness from useRuntimeState
 * - Schema from useRuntimeState
 *
 * Note: SQLite database lives in runtime and handles its own persistence.
 * No explicit save needed.
 */

import { useMemo } from "react";
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
}

/**
 * Hook for database operations
 *
 * Returns database state when runtime is ready.
 * SQLite persistence is automatic - no manual save needed.
 */
export function useDatabase(): UseDatabase {
  const { isDbReady, isDbBooting, schema } = useRuntimeState();

  return useMemo(
    () => ({
      isReady: isDbReady,
      isBooting: isDbBooting,
      schema,
      tableCount: schema.length,
    }),
    [isDbReady, isDbBooting, schema],
  );
}
