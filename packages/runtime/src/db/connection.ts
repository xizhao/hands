/**
 * PostgreSQL connection pool and query execution
 */

import postgres from "postgres";
import type { QueryResult } from "../types";

/**
 * Format PostgreSQL notice messages for clean logging
 */
function formatNotice(notice: { severity?: string; message?: string; code?: string }): string {
  const severity = notice.severity || "NOTICE";
  const message = notice.message || "Unknown notice";
  // Only show code for non-standard messages
  const codeStr = notice.code && !["00000", "42P06", "42P07"].includes(notice.code)
    ? ` [${notice.code}]`
    : "";
  return `[postgres] ${severity}${codeStr}: ${message}`;
}

export class PostgresPool {
  private sql: ReturnType<typeof postgres> | null = null;
  private connectionString: string;

  constructor(connectionString: string) {
    this.connectionString = connectionString;
  }

  /**
   * Initialize the connection pool
   */
  connect(): void {
    // Close existing connection if any
    if (this.sql) {
      this.sql.end().catch(() => {});
    }

    this.sql = postgres(this.connectionString, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
      onnotice: (notice) => console.log(formatNotice(notice)),
    });
  }

  /**
   * Reconnect to the database
   */
  async reconnect(): Promise<void> {
    await this.close();
    this.connect();
  }

  /**
   * Execute a query and return results
   */
  async query(queryText: string): Promise<QueryResult> {
    if (!this.sql) {
      throw new Error("Not connected to database");
    }

    const result = await this.sql.unsafe(queryText);

    return {
      rows: Array.isArray(result) ? result : [],
      rowCount: result.count ?? (Array.isArray(result) ? result.length : 0),
      command: queryText.trim().split(/\s+/)[0].toUpperCase(),
    };
  }

  /**
   * Execute a query without returning results (for DDL/DML)
   */
  async execute(queryText: string): Promise<{ rowCount: number }> {
    if (!this.sql) {
      throw new Error("Not connected to database");
    }

    const result = await this.sql.unsafe(queryText);
    return { rowCount: result.count ?? 0 };
  }

  /**
   * Check if the connection is healthy
   */
  async ping(): Promise<boolean> {
    if (!this.sql) return false;

    try {
      await this.sql`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Close all connections
   */
  async close(): Promise<void> {
    if (this.sql) {
      await this.sql.end();
      this.sql = null;
    }
  }
}
