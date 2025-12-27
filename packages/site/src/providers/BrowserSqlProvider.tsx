import { useState, useEffect, useCallback, type ReactNode } from "react";
import {
  LiveQueryProvider,
  type QueryResult,
  type MutationResult,
} from "@hands/core/stdlib";
import { initDatabase, executeQuery, executeMutation } from "../lib/sql";

// ============================================================================
// Types
// ============================================================================

interface BrowserSqlProviderProps {
  children: ReactNode;
}

// ============================================================================
// Query State Management
// ============================================================================

/**
 * Global version counter to trigger re-renders on mutations.
 * Each mutation increments this, causing all queries to refetch.
 */
let globalVersion = 0;
const listeners = new Set<() => void>();

function incrementVersion() {
  globalVersion++;
  listeners.forEach((listener) => listener());
}

function useVersion() {
  const [, setVersion] = useState(0);

  useEffect(() => {
    const listener = () => setVersion((v) => v + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return globalVersion;
}

// ============================================================================
// Global Database State
// ============================================================================

// Use a ref-like pattern with global state so hooks can access latest value
let isDbReady = false;
const dbReadyListeners = new Set<() => void>();

function setDbReady(ready: boolean) {
  isDbReady = ready;
  dbReadyListeners.forEach((listener) => listener());
}

function useDbReady() {
  const [ready, setReady] = useState(isDbReady);

  useEffect(() => {
    const listener = () => setReady(isDbReady);
    dbReadyListeners.add(listener);
    // Sync on mount in case it changed
    setReady(isDbReady);
    return () => {
      dbReadyListeners.delete(listener);
    };
  }, []);

  return ready;
}

// ============================================================================
// Hook Implementations
// ============================================================================

/**
 * Query hook for sql.js - checks isDbReady on each execution
 */
function useQuery(
  sql: string,
  params?: Record<string, unknown>
): QueryResult {
  const [data, setData] = useState<Record<string, unknown>[] | undefined>(undefined);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Subscribe to database ready state
  const dbReady = useDbReady();

  // Subscribe to version changes for refetch
  const version = useVersion();

  const executeQueryFn = useCallback(() => {
    if (!isDbReady || !sql) {
      setIsLoading(!isDbReady);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const results = executeQuery(sql, params);
      setData(results);
    } catch (err) {
      console.error("[BrowserSqlProvider] Query error:", err, sql);
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, [sql, params, dbReady]); // dbReady in deps triggers re-execution when ready

  // Execute query on mount and when dependencies change
  useEffect(() => {
    executeQueryFn();
  }, [executeQueryFn, version]);

  const refetch = useCallback(() => {
    executeQueryFn();
  }, [executeQueryFn]);

  return { data, isLoading, error, refetch };
}

/**
 * Mutation hook for sql.js
 */
function useMutation(): MutationResult {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mutate = useCallback(
    async (sql: string, params?: Record<string, unknown>) => {
      if (!isDbReady) {
        console.warn("[BrowserSqlProvider] Database not ready, skipping mutation");
        return;
      }

      setIsPending(true);
      setError(null);

      try {
        executeMutation(sql, params);
        // Trigger refetch of all queries
        incrementVersion();
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        setError(e);
        throw e;
      } finally {
        setIsPending(false);
      }
    },
    []
  );

  return { mutate, isPending, error };
}

// ============================================================================
// Provider Component
// ============================================================================

/**
 * Browser SQL Provider using sql.js (SQLite compiled to WASM).
 *
 * Initializes the database on mount and provides query/mutation hooks
 * compatible with LiveQueryProvider from @hands/core.
 *
 * Does NOT block rendering - shows children immediately with loading states.
 */
export function BrowserSqlProvider({ children }: BrowserSqlProviderProps) {
  const [initError, setInitError] = useState<Error | null>(null);

  // Initialize database on mount
  useEffect(() => {
    console.log("[BrowserSqlProvider] Initializing database...");
    initDatabase()
      .then(() => {
        console.log("[BrowserSqlProvider] Database ready!");
        setDbReady(true);
      })
      .catch((err) => {
        console.error("[BrowserSqlProvider] Failed to initialize database:", err);
        setInitError(err instanceof Error ? err : new Error(String(err)));
      });
  }, []);

  return (
    <LiveQueryProvider useQuery={useQuery} useMutation={useMutation}>
      {children}
      {/* Non-blocking error banner */}
      {initError && (
        <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 bg-destructive text-destructive-foreground px-4 py-3 rounded-lg shadow-lg text-sm">
          <div className="font-medium">Database initialization failed</div>
          <div className="text-xs opacity-90 mt-1">
            Live queries will not work. {initError.message}
          </div>
        </div>
      )}
    </LiveQueryProvider>
  );
}
