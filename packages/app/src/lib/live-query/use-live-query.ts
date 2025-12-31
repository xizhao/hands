/**
 * useLiveQuery Hook
 *
 * Reactive SQL queries that automatically update when the database changes.
 * Uses tRPC useQuery for caching/deduplication and SSE for change notifications.
 *
 * Same SQL query = same cache entry = automatic deduplication across components.
 */

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";
import { type DbChangeEvent, useDbSubscription } from "../db-subscription";
import { trpc } from "../trpc";

export interface UseLiveQueryOptions {
  /** SQL query string */
  sql: string;
  /** Query parameters (positional) */
  params?: unknown[];
  /** Polling interval in ms (fallback if SSE fails, default: 0 = disabled) */
  pollInterval?: number;
  /** Whether the query is enabled */
  enabled?: boolean;
  /** Runtime port for SSE subscription */
  runtimePort?: number | null;
  /** Max retry attempts on error (default: 5) */
  maxRetries?: number;
  /** Base retry delay in ms (default: 500, uses exponential backoff) */
  retryDelay?: number;
}

export interface LiveQueryResult<T> {
  /** Query result rows */
  data: T[];
  /** Whether the initial fetch is in progress */
  isLoading: boolean;
  /** Whether a refetch is in progress */
  isFetching: boolean;
  /** Error from the last query attempt */
  error: Error | null;
  /** Whether currently retrying after an error */
  isRetrying: boolean;
  /** Current retry attempt number (0 if not retrying) */
  retryCount: number;
  /** Manually trigger a refetch */
  refetch: () => Promise<void>;
  /** Data version from the database */
  dataVersion: number;
}

/**
 * Hook for reactive SQL queries with automatic updates on database changes.
 *
 * Uses TanStack Query's useQuery for automatic caching and deduplication:
 * - Same SQL + params = same cache entry
 * - Multiple components with same query share one fetch
 * - SSE invalidates all queries at once
 */
export function useLiveQuery<T = Record<string, unknown>>(
  options: UseLiveQueryOptions,
): LiveQueryResult<T> {
  const {
    sql,
    params = [],
    pollInterval = 0,
    enabled = true,
    runtimePort,
    maxRetries = 5,
    retryDelay = 500,
  } = options;

  const queryClient = useQueryClient();
  const dataVersionRef = useRef(0);

  // Use tRPC's useQuery for caching/deduplication
  // Same sql + params = same cache entry across all components
  const {
    data: result,
    isLoading,
    isFetching,
    error: queryError,
    refetch: trpcRefetch,
    failureCount,
    isRefetching,
  } = trpc.db.select.useQuery(
    { sql, params },
    {
      enabled: enabled && !!sql,
      staleTime: 0, // Always fresh - deduplication still works within same render
      retry: maxRetries,
      retryDelay: (attemptIndex) => retryDelay * 2 ** attemptIndex,
      meta: { suppressError: true }, // Handle errors locally in component
    },
  );

  // Subscribe to database changes via SSE
  // Invalidates all live queries when database changes
  useDbSubscription(runtimePort ?? null, (event: DbChangeEvent) => {
    if (event.type === "change") {
      dataVersionRef.current = event.dataVersion;
      // Invalidate all db.select queries - they'll refetch automatically
      queryClient.invalidateQueries({ queryKey: [["db", "select"]] });
    } else if (event.type === "connected") {
      dataVersionRef.current = event.dataVersion;
    }
  });

  // Fallback polling if enabled (in case SSE fails)
  useEffect(() => {
    if (!enabled || pollInterval <= 0) return;

    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: [["db", "select"]] });
    }, pollInterval);
    return () => clearInterval(interval);
  }, [enabled, pollInterval, queryClient]);

  // Wrap refetch for stable reference
  const refetch = useCallback(async () => {
    await trpcRefetch();
  }, [trpcRefetch]);

  // Convert query error to Error type
  const error =
    queryError instanceof Error ? queryError : queryError ? new Error(String(queryError)) : null;

  return {
    data: (result?.rows as T[]) ?? [],
    isLoading,
    isFetching,
    error,
    isRetrying: failureCount > 0 && isRefetching,
    retryCount: failureCount,
    refetch,
    dataVersion: dataVersionRef.current,
  };
}

/**
 * Simplified hook that just returns data and loading state
 */
export function useSqlQuery<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[],
  options?: { enabled?: boolean; runtimePort?: number | null },
): { data: T[]; isLoading: boolean; error: Error | null } {
  const result = useLiveQuery<T>({
    sql,
    params,
    enabled: options?.enabled ?? true,
    runtimePort: options?.runtimePort,
  });

  return {
    data: result.data,
    isLoading: result.isLoading,
    error: result.error,
  };
}
