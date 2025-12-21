import { useState, useEffect, useCallback, useMemo, type ReactNode } from "react";
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
// Hook Implementations
// ============================================================================

/**
 * Creates a useQuery hook for sql.js.
 */
function createUseQuery(isReady: boolean) {
  return function useQuery(
    sql: string,
    params?: Record<string, unknown>
  ): QueryResult {
    const [data, setData] = useState<Record<string, unknown>[] | undefined>(
      undefined
    );
    const [error, setError] = useState<Error | null>(null);
    const [isLoading, setIsLoading] = useState(!isReady);

    // Subscribe to version changes for refetch
    const version = useVersion();

    const executeQueryFn = useCallback(() => {
      if (!isReady || !sql) {
        setIsLoading(!isReady);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const results = executeQuery(sql, params);
        setData(results);
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        setIsLoading(false);
      }
    }, [sql, params, isReady]);

    // Execute query on mount and when dependencies change
    useEffect(() => {
      executeQueryFn();
    }, [executeQueryFn, version]);

    const refetch = useCallback(() => {
      executeQueryFn();
    }, [executeQueryFn]);

    return { data, isLoading, error, refetch };
  };
}

/**
 * Creates a useMutation hook for sql.js.
 */
function createUseMutation(isReady: boolean) {
  return function useMutation(): MutationResult {
    const [isPending, setIsPending] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    const mutate = useCallback(
      async (sql: string, params?: Record<string, unknown>) => {
        if (!isReady) {
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
      [isReady]
    );

    return { mutate, isPending, error };
  };
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
  const [isReady, setIsReady] = useState(false);
  const [initError, setInitError] = useState<Error | null>(null);

  // Initialize database on mount
  useEffect(() => {
    initDatabase()
      .then(() => {
        setIsReady(true);
      })
      .catch((err) => {
        console.error("[BrowserSqlProvider] Failed to initialize database:", err);
        setInitError(err instanceof Error ? err : new Error(String(err)));
      });
  }, []);

  // Create hooks bound to current ready state
  const useQuery = useMemo(() => createUseQuery(isReady), [isReady]);
  const useMutation = useMemo(() => createUseMutation(isReady), [isReady]);

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
