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
  /** Max retry attempts on error (default: 3) */
  maxRetries?: number;
  /** Base retry delay in ms (default: 1000, uses exponential backoff) */
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
 * Hook for reactive SQL queries with automatic updates on database changes
 */
export function useLiveQuery<T = Record<string, unknown>>(
  options: UseLiveQueryOptions
): LiveQueryResult<T> {
  const {
    sql,
    params = [],
    pollInterval = 0,
    enabled = true,
    runtimePort,
    maxRetries = 3,
    retryDelay = 1000,
  } = options;

  const [data, setData] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [dataVersion, setDataVersion] = useState(0);

  // Refs for stable callbacks
  const sqlRef = useRef(sql);
  const paramsRef = useRef(params);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  sqlRef.current = sql;
  paramsRef.current = params;

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, []);

  // tRPC mutation for queries
  const queryMutation = trpc.db.query.useMutation();

  // Fetch data with retry logic
  const fetchData = useCallback(async (isRetryAttempt = false) => {
    if (!enabled) return;

    if (!isRetryAttempt) {
      setIsFetching(true);
      setRetryCount(0);
      setIsRetrying(false);
    }

    try {
      const result = await queryMutation.mutateAsync({
        sql: sqlRef.current,
        params: paramsRef.current,
      });
      if (!mountedRef.current) return;
      setData(result.rows as T[]);
      setError(null);
      setIsRetrying(false);
      setRetryCount(0);
    } catch (err) {
      if (!mountedRef.current) return;
      const newError = err instanceof Error ? err : new Error(String(err));
      setError(newError);

      // Auto-retry with exponential backoff
      const currentRetry = isRetryAttempt ? retryCount : 0;
      if (currentRetry < maxRetries) {
        const nextRetry = currentRetry + 1;
        const delay = retryDelay * Math.pow(2, currentRetry); // Exponential backoff

        setIsRetrying(true);
        setRetryCount(nextRetry);

        retryTimeoutRef.current = setTimeout(() => {
          if (mountedRef.current) {
            fetchData(true);
          }
        }, delay);
      } else {
        setIsRetrying(false);
      }
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
        setIsFetching(false);
      }
    }
  }, [enabled, queryMutation, maxRetries, retryDelay, retryCount]);

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

  // Wrap refetch to reset retry state
  const refetch = useCallback(async () => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
    }
    setRetryCount(0);
    setIsRetrying(false);
    await fetchData(false);
  }, [fetchData]);

  return {
    data,
    isLoading,
    isFetching,
    error,
    isRetrying,
    retryCount,
    refetch,
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
