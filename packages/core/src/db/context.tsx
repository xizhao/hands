/**
 * Database Context
 *
 * Provides an abstraction layer for database access.
 * Runtime uses Kysely/D1, Viewer uses D1 HTTP API.
 */

import { createContext, useContext, type ReactNode } from "react";

export interface DbQueryResult {
  rows: Record<string, unknown>[];
}

/**
 * Database adapter interface for executing SQL queries.
 * Implemented by runtime (Kysely) and viewer (D1 HTTP API).
 */
export interface DbAdapter {
  /**
   * Execute a raw SQL query
   */
  executeQuery: (sql: string, params?: unknown[]) => Promise<DbQueryResult>;
}

const DbAdapterContext = createContext<DbAdapter | null>(null);

export function DbProvider({
  children,
  db,
}: {
  children: ReactNode;
  db: DbAdapter;
}) {
  return <DbAdapterContext.Provider value={db}>{children}</DbAdapterContext.Provider>;
}

export function useDb(): DbAdapter {
  const ctx = useContext(DbAdapterContext);
  if (!ctx) {
    throw new Error("useDb must be used within a DbProvider");
  }
  return ctx;
}
