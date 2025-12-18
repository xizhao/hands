/**
 * useLiveQuery Hook
 *
 * Reactive SQL queries that automatically update when the database changes.
 * Uses tRPC for data fetching and SSE for change notifications.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useDbSubscription, type DbChangeEvent } from "../db-subscription";
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
  /** Manually trigger a refetch */
  refetch: () => Promise<void>;
  /** Data version from the database */
  dataVersion: number;
}

/**
 * Hook for reactive SQL queries with automatic updates on database changes
 */
export function useLiveQuery<T = Record<string, unknown>>(
  options: UseLiveQueryOptions
): LiveQueryResult<T> {
  const { sql, params = [], pollInterval = 0, enabled = true, runtimePort } = options;

  const [data, setData] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [dataVersion, setDataVersion] = useState(0);

  // Refs for stable callbacks
  const sqlRef = useRef(sql);
  const paramsRef = useRef(params);
  sqlRef.current = sql;
  paramsRef.current = params;

  // tRPC mutation for queries
  const queryMutation = trpc.db.query.useMutation();

  // Fetch data
  const fetchData = useCallback(async () => {
    if (!enabled) return;

    setIsFetching(true);
    try {
      const result = await queryMutation.mutateAsync({
        sql: sqlRef.current,
        params: paramsRef.current,
      });
      setData(result.rows as T[]);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
      setIsFetching(false);
    }
  }, [enabled, queryMutation]);

  // Initial fetch and refetch when sql/params change
  useEffect(() => {
    if (enabled) {
      fetchData();
    }
  }, [sql, JSON.stringify(params), enabled]);

  // Subscribe to database changes via SSE
  useDbSubscription(runtimePort ?? null, (event: DbChangeEvent) => {
    if (event.type === "change") {
      setDataVersion(event.dataVersion);
      fetchData();
    } else if (event.type === "connected") {
      setDataVersion(event.dataVersion);
    }
  });

  // Fallback polling if enabled
  useEffect(() => {
    if (!enabled || pollInterval <= 0) return;

    const interval = setInterval(fetchData, pollInterval);
    return () => clearInterval(interval);
  }, [enabled, pollInterval, fetchData]);

  return {
    data,
    isLoading,
    isFetching,
    error,
    refetch: fetchData,
    dataVersion,
  };
}

/**
 * Simplified hook that just returns data and loading state
 */
export function useSqlQuery<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[],
  options?: { enabled?: boolean; runtimePort?: number | null }
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
