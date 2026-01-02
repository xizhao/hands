/**
 * Viewer D1 HTTP Database Adapter
 *
 * Implements DbAdapter using D1 HTTP API for production viewer.
 * Includes safeguards to prevent CPU timeouts from large result sets.
 */

import type { DbAdapter } from "@hands/core/types";
import type { D1Client } from "./d1-client";

// Max rows to prevent CPU timeout on Workers (rendering is expensive)
const MAX_ROWS = 500;

/**
 * Add LIMIT clause if query doesn't have one and is a SELECT
 */
function addLimitIfNeeded(sql: string): string {
  const upper = sql.toUpperCase().trim();
  if (!upper.startsWith("SELECT")) return sql;
  // Check for existing LIMIT (case-insensitive)
  if (/\bLIMIT\s+\d+/i.test(sql)) return sql;

  // Add LIMIT to unbounded SELECT queries
  return `${sql.trim()} LIMIT ${MAX_ROWS}`;
}

/**
 * Create a DbAdapter that wraps the D1 HTTP client
 */
export function createViewerDbAdapter(db: D1Client): DbAdapter {
  return {
    async executeQuery(sql: string, params?: unknown[]) {
      // Safeguard: add LIMIT to prevent CPU timeout
      const safeSql = addLimitIfNeeded(sql);
      const results = await db.liveQuery(safeSql, params);
      return { rows: results };
    },
  };
}
