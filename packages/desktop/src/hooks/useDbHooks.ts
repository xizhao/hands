/**
 * React hooks for database browser
 *
 * Provides reactive access to database changes and table data.
 */

import { useMemo, useEffect } from "react";
import { useLiveQuery } from "@tanstack/react-db";
import { useQuery } from "@tanstack/react-query";
import { eq } from "@tanstack/db";
import {
  dbChangesCollection,
  subscribeToDbChanges,
  fetchTables,
  fetchTableColumns,
  fetchTableRows,
  type ChangeRecord,
} from "./useDbBrowser";
import { useRuntimePort } from "./useDbContext";

// Re-export ChangeRecord for consumers
export type { ChangeRecord } from "./useDbBrowser";

// ============ CHANGE HOOKS ============

/**
 * Get all recent changes, sorted by timestamp (newest first)
 */
export function useRecentChanges(limit = 50) {
  const { data } = useLiveQuery(dbChangesCollection);

  const sorted = useMemo(() => {
    if (!data) return [];
    return [...data].sort((a, b) => b.ts - a.ts).slice(0, limit);
  }, [data, limit]);

  return sorted;
}

/**
 * Get recent changes for a specific table
 */
export function useTableChanges(tableName: string | null, limit = 20) {
  const { data } = useLiveQuery(
    (q) =>
      tableName
        ? q.from({ c: dbChangesCollection }).where(({ c }) => eq(c.table, tableName))
        : null,
    [tableName]
  );

  const sorted = useMemo(() => {
    if (!data) return [];
    return [...data].sort((a, b) => b.ts - a.ts).slice(0, limit);
  }, [data, limit]);

  return sorted;
}

/**
 * Check if a table has recent changes (within the last N seconds)
 */
export function useTableHasRecentChanges(tableName: string | null, withinSeconds = 60) {
  const changes = useTableChanges(tableName, 1);
  const now = Date.now() / 1000;

  return changes.length > 0 && now - changes[0].ts < withinSeconds;
}

/**
 * Get the most recent change for a table (for indicator color)
 */
export function useTableLatestChange(tableName: string | null): ChangeRecord | null {
  const changes = useTableChanges(tableName, 1);
  return changes[0] || null;
}

// ============ TABLE DATA HOOKS ============

/**
 * Get list of all tables in the database
 */
export function useTables() {
  const runtimePort = useRuntimePort();

  return useQuery({
    queryKey: ["db-tables", runtimePort],
    queryFn: () => fetchTables(runtimePort!),
    enabled: !!runtimePort,
    staleTime: 30000, // Cache for 30 seconds
  });
}

/**
 * Get columns for a specific table
 */
export function useTableColumns(tableName: string | null) {
  const runtimePort = useRuntimePort();

  return useQuery({
    queryKey: ["db-table-columns", runtimePort, tableName],
    queryFn: () => fetchTableColumns(runtimePort!, tableName!),
    enabled: !!runtimePort && !!tableName,
    staleTime: 60000, // Cache for 1 minute
  });
}

/**
 * Get rows for a specific table with pagination
 */
export function useTableRows(tableName: string | null, page = 0, pageSize = 50) {
  const runtimePort = useRuntimePort();

  // Get recent changes to build highlight map
  const recentChanges = useTableChanges(tableName, 100);

  const query = useQuery({
    queryKey: ["db-table-rows", runtimePort, tableName, page, pageSize],
    queryFn: () =>
      fetchTableRows(runtimePort!, tableName!, pageSize, page * pageSize),
    enabled: !!runtimePort && !!tableName,
    staleTime: 5000, // Cache for 5 seconds
  });

  // Build a map of rowId -> most recent change for highlighting
  const changeMap = useMemo(() => {
    const map = new Map<string, ChangeRecord>();
    for (const change of recentChanges) {
      if (change.rowId && !map.has(change.rowId)) {
        map.set(change.rowId, change);
      }
    }
    return map;
  }, [recentChanges]);

  return {
    ...query,
    changeMap,
  };
}

// ============ SYNC HOOK ============

/**
 * Initialize SSE subscription for database changes
 * Call this once in your app (e.g., in DbBrowser component)
 *
 * @param onNewChange - Optional callback when a new change is received (not history)
 */
export function useDbSync(onNewChange?: (change: ChangeRecord) => void) {
  const runtimePort = useRuntimePort();

  useEffect(() => {
    if (!runtimePort) {
      console.log("[useDbSync] No runtime port available yet, waiting...");
      return;
    }

    console.log("[useDbSync] Starting db sync with runtime port:", runtimePort);
    const cleanup = subscribeToDbChanges(
      runtimePort,
      (err) => {
        console.error("[useDbSync] SSE error:", err);
      },
      onNewChange
    );

    return cleanup;
  }, [runtimePort, onNewChange]);
}

// ============ UTILITY HOOKS ============

/**
 * Get row highlight style based on change operation and age
 */
export function getRowHighlightClass(
  change: ChangeRecord | undefined,
  maxAgeSeconds = 30
): string {
  if (!change) return "";

  const age = Date.now() / 1000 - change.ts;
  if (age > maxAgeSeconds) return "";

  // Calculate opacity based on age (fades from 0.3 to 0.1)
  const opacity = Math.max(0.1, 0.3 - (age / maxAgeSeconds) * 0.2);
  const opacityPercent = Math.round(opacity * 100);

  switch (change.op) {
    case "INSERT":
      return `bg-green-500/${opacityPercent}`;
    case "UPDATE":
      return `bg-yellow-500/${opacityPercent}`;
    case "DELETE":
      return `bg-red-500/${opacityPercent} line-through opacity-50`;
    default:
      return "";
  }
}

/**
 * Get indicator color for table list based on most recent change
 */
export function getTableIndicatorColor(
  change: ChangeRecord | null,
  maxAgeSeconds = 60
): string | null {
  if (!change) return null;

  const age = Date.now() / 1000 - change.ts;
  if (age > maxAgeSeconds) return null;

  switch (change.op) {
    case "INSERT":
      return "bg-green-500";
    case "UPDATE":
      return "bg-yellow-500";
    case "DELETE":
      return "bg-red-500";
    default:
      return null;
  }
}

/**
 * Format timestamp as relative time (e.g., "5s", "2m", "1h")
 */
export function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor(Date.now() / 1000 - timestamp);
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

/**
 * Format cell value for display
 */
export function formatCellValue(value: unknown): string {
  if (value === null) return "NULL";
  if (value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}
