/**
 * Local Database Provider
 *
 * Provides in-browser SQLite via Web Worker with OPFS persistence.
 *
 * Key features:
 * - SQLite runs in Web Worker where OPFS is available
 * - OPFS provides persistent storage across refreshes
 * - Communication via postMessage
 * - React Query integration for caching
 * - Change notifications for reactive queries
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
  type ReactNode,
} from "react";

// Import worker using Vite's worker syntax
import SqliteWorker from "./sqlite.worker?worker";

// ============================================================================
// Types
// ============================================================================

export interface TableSchema {
  table_name: string;
  columns: Array<{ name: string; type: string; nullable: boolean }>;
}

interface LocalDatabaseContextValue {
  /** Is the database ready? */
  isReady: boolean;
  /** Is the database loading? */
  isLoading: boolean;
  /** Current workbook ID */
  workbookId: string | null;
  /** Database schema */
  schema: TableSchema[];
  /** Data version (increments on changes) */
  dataVersion: number;
  /** Execute a read query */
  query: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T[]>;
  /** Execute a mutation (INSERT/UPDATE/DELETE) */
  execute: (sql: string, params?: unknown[]) => Promise<void>;
  /** Trigger change notification (for reactive queries) */
  notifyChange: () => void;
  /** Open a workbook database */
  openWorkbook: (workbookId: string) => Promise<void>;
  /** Close the current database */
  closeWorkbook: () => Promise<void>;
  /** Is OPFS available? */
  hasOpfs: boolean;
}

const LocalDatabaseContext = createContext<LocalDatabaseContextValue | null>(null);

// ============================================================================
// Worker Communication
// ============================================================================

type WorkerRequest =
  | { id: number; type: "open"; workbookId: string }
  | { id: number; type: "close" }
  | { id: number; type: "query"; sql: string; params?: unknown[] }
  | { id: number; type: "execute"; sql: string; params?: unknown[] }
  | { id: number; type: "schema" };

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

// ============================================================================
// Provider Component
// ============================================================================

interface LocalDatabaseProviderProps {
  children: ReactNode;
  /** Initial workbook ID to open */
  initialWorkbookId?: string;
}

export function LocalDatabaseProvider({ children, initialWorkbookId }: LocalDatabaseProviderProps) {
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [workbookId, setWorkbookId] = useState<string | null>(null);
  const [schema, setSchema] = useState<TableSchema[]>([]);
  const [dataVersion, setDataVersion] = useState(0);
  const [hasOpfs, setHasOpfs] = useState(false);

  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  const pendingRequestsRef = useRef<Map<number, PendingRequest>>(new Map());
  const workerReadyRef = useRef(false);
  const workerReadyPromiseRef = useRef<Promise<void> | null>(null);
  const workerReadyResolveRef = useRef<(() => void) | null>(null);

  // Notify change - increments version and triggers reactive queries
  const notifyChange = useCallback(() => {
    setDataVersion((v) => v + 1);
  }, []);

  // Send message to worker and wait for response
  const sendMessage = useCallback(<T,>(message: Omit<WorkerRequest, "id">): Promise<T> => {
    return new Promise((resolve, reject) => {
      if (!workerRef.current) {
        reject(new Error("Worker not initialized"));
        return;
      }

      const id = ++requestIdRef.current;
      pendingRequestsRef.current.set(id, {
        resolve: resolve as (v: unknown) => void,
        reject,
      });

      workerRef.current.postMessage({ ...message, id });
    });
  }, []);

  // Wait for worker to be ready
  const waitForWorker = useCallback((): Promise<void> => {
    if (workerReadyRef.current) return Promise.resolve();
    if (workerReadyPromiseRef.current) return workerReadyPromiseRef.current;

    workerReadyPromiseRef.current = new Promise((resolve) => {
      workerReadyResolveRef.current = resolve;
    });

    return workerReadyPromiseRef.current;
  }, []);

  // Initialize worker
  useEffect(() => {
    const worker = new SqliteWorker();
    workerRef.current = worker;

    worker.onmessage = (e) => {
      const data = e.data;

      // Handle ready message
      if (data.type === "ready") {
        console.log("[LocalDB] Worker ready, OPFS:", data.hasOpfs);
        setHasOpfs(data.hasOpfs);
        workerReadyRef.current = true;
        workerReadyResolveRef.current?.();
        return;
      }

      // Handle schema change notification
      if (data.type === "schema-changed") {
        // Refresh schema
        sendMessage<TableSchema[]>({ type: "schema" }).then(setSchema);
        notifyChange();
        return;
      }

      // Handle response
      const pending = pendingRequestsRef.current.get(data.id);
      if (!pending) return;

      pendingRequestsRef.current.delete(data.id);

      if (data.type === "error") {
        pending.reject(new Error(data.error));
      } else {
        pending.resolve(data.result);
      }
    };

    worker.onerror = (err) => {
      console.error("[LocalDB] Worker error:", err);
    };

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, [sendMessage, notifyChange]);

  // Open a workbook database
  const openWorkbook = useCallback(async (id: string) => {
    setIsLoading(true);

    try {
      await waitForWorker();
      await sendMessage({ type: "open", workbookId: id });

      // Load schema
      const schemaResult = await sendMessage<TableSchema[]>({ type: "schema" });

      setWorkbookId(id);
      setSchema(schemaResult);
      setIsReady(true);
      setDataVersion((v) => v + 1);

      console.log("[LocalDB] Database opened:", id);
    } catch (err) {
      console.error("[LocalDB] Failed to open workbook:", err);
    } finally {
      setIsLoading(false);
    }
  }, [waitForWorker, sendMessage]);

  // Close the current database
  const closeWorkbook = useCallback(async () => {
    try {
      await sendMessage({ type: "close" });
    } catch (err) {
      console.error("[LocalDB] Failed to close:", err);
    }

    setWorkbookId(null);
    setSchema([]);
    setIsReady(false);
  }, [sendMessage]);

  // Execute a read query
  const query = useCallback(async <T = Record<string, unknown>>(
    sql: string,
    params?: unknown[]
  ): Promise<T[]> => {
    if (!isReady) {
      console.warn("[LocalDB] Query called before database ready");
      return [];
    }

    try {
      return await sendMessage<T[]>({ type: "query", sql, params });
    } catch (err) {
      console.error("[LocalDB] Query error:", err, sql);
      throw err;
    }
  }, [isReady, sendMessage]);

  // Execute a mutation
  const execute = useCallback(async (sql: string, params?: unknown[]): Promise<void> => {
    if (!isReady) {
      console.warn("[LocalDB] Execute called before database ready");
      return;
    }

    try {
      await sendMessage({ type: "execute", sql, params });

      // Refresh schema if DDL
      if (/^\s*(CREATE|DROP|ALTER)\s/i.test(sql)) {
        const schemaResult = await sendMessage<TableSchema[]>({ type: "schema" });
        setSchema(schemaResult);
      }

      notifyChange();
    } catch (err) {
      console.error("[LocalDB] Execute error:", err, sql);
      throw err;
    }
  }, [isReady, sendMessage, notifyChange]);

  // Auto-open initial workbook
  useEffect(() => {
    if (initialWorkbookId) {
      openWorkbook(initialWorkbookId);
    } else {
      setIsLoading(false);
    }
  }, [initialWorkbookId]); // Don't include openWorkbook to avoid re-running

  const value = useMemo((): LocalDatabaseContextValue => ({
    isReady,
    isLoading,
    workbookId,
    schema,
    dataVersion,
    query,
    execute,
    notifyChange,
    openWorkbook,
    closeWorkbook,
    hasOpfs,
  }), [isReady, isLoading, workbookId, schema, dataVersion, query, execute, notifyChange, openWorkbook, closeWorkbook, hasOpfs]);

  return (
    <LocalDatabaseContext.Provider value={value}>
      {children}
    </LocalDatabaseContext.Provider>
  );
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Access the local database context
 */
export function useLocalDatabase(): LocalDatabaseContextValue {
  const ctx = useContext(LocalDatabaseContext);
  if (!ctx) {
    throw new Error("useLocalDatabase must be used within LocalDatabaseProvider");
  }
  return ctx;
}

/**
 * Reactive SQL query hook - re-runs when database changes
 */
export function useLocalQuery<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[],
  options?: { enabled?: boolean }
): { data: T[]; isLoading: boolean; error: Error | null; refetch: () => void } {
  const { query, dataVersion, isReady } = useLocalDatabase();
  const enabled = options?.enabled ?? true;

  const [data, setData] = useState<T[]>([]);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const runQuery = useCallback(async () => {
    if (!isReady || !enabled || !sql) {
      setData([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const results = await query<T>(sql, params);
      setData(results);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      setData([]);
    } finally {
      setIsLoading(false);
    }
  }, [query, sql, JSON.stringify(params), isReady, enabled]);

  // Run query on mount and when dataVersion changes
  useEffect(() => {
    runQuery();
  }, [runQuery, dataVersion]);

  return { data, isLoading, error, refetch: runQuery };
}

/**
 * SQL mutation hook
 */
export function useLocalMutation(): {
  mutate: (sql: string, params?: unknown[]) => void;
  mutateAsync: (sql: string, params?: unknown[]) => Promise<void>;
  isPending: boolean;
  error: Error | null;
} {
  const { execute } = useLocalDatabase();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mutate = useCallback((sql: string, params?: unknown[]) => {
    execute(sql, params).catch((err) => {
      setError(err instanceof Error ? err : new Error(String(err)));
    });
  }, [execute]);

  const mutateAsync = useCallback(async (sql: string, params?: unknown[]) => {
    setIsPending(true);
    try {
      await execute(sql, params);
      setError(null);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    } finally {
      setIsPending(false);
    }
  }, [execute]);

  return { mutate, mutateAsync, isPending, error };
}

/**
 * Schema hook
 */
export function useLocalSchema(): {
  data: TableSchema[];
  isLoading: boolean;
} {
  const { schema, isLoading } = useLocalDatabase();
  return { data: schema, isLoading };
}
