/**
 * Live Query Provider
 *
 * Context provider for live query infrastructure.
 * Manages database subscription and collection registry.
 */

import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useDbSubscription, type DbChangeEvent } from "../db-subscription";
import { trpc } from "../trpc";

export interface LiveQueryConfig {
  runtimePort: number;
}

interface LiveQueryContextValue {
  runtimePort: number;
  /** Version number that increments on each db change */
  dataVersion: number;
  /** Execute a SQL query */
  executeQuery: <T = Record<string, unknown>>(
    sql: string,
    params?: unknown[]
  ) => Promise<T[]>;
}

const LiveQueryContext = createContext<LiveQueryContextValue | null>(null);

export function useLiveQueryContext() {
  const ctx = useContext(LiveQueryContext);
  if (!ctx) {
    throw new Error("useLiveQueryContext must be used within LiveQueryProvider");
  }
  return ctx;
}

interface LiveQueryProviderProps {
  config: LiveQueryConfig;
  children: ReactNode;
}

export function LiveQueryProvider({ config, children }: LiveQueryProviderProps) {
  const { runtimePort } = config;
  const dataVersionRef = useRef(0);
  const listenersRef = useRef(new Set<() => void>());

  // tRPC mutation for queries
  const queryMutation = trpc.db.query.useMutation();

  // Subscribe to database changes
  useDbSubscription(runtimePort, (event: DbChangeEvent) => {
    if (event.type === "change" || event.type === "connected") {
      dataVersionRef.current = event.dataVersion;
      // Notify all listeners
      for (const listener of listenersRef.current) {
        listener();
      }
    }
  });

  const executeQuery = useMemo(() => {
    return async <T = Record<string, unknown>>(
      sql: string,
      params?: unknown[]
    ): Promise<T[]> => {
      const result = await queryMutation.mutateAsync({ sql, params });
      return result.rows as T[];
    };
  }, [queryMutation]);

  const value = useMemo(
    (): LiveQueryContextValue => ({
      runtimePort,
      dataVersion: dataVersionRef.current,
      executeQuery,
    }),
    [runtimePort, executeQuery]
  );

  return (
    <LiveQueryContext.Provider value={value}>
      {children}
    </LiveQueryContext.Provider>
  );
}
