/**
 * SQLite tRPC Router
 *
 * Type-safe API for database operations using direct SQLite access.
 * Database is stored at {workbookDir}/.hands/workbook.db
 */

import { initTRPC, TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  getWorkbookDb,
  executeQuery,
  getSchema,
  type QueryResult,
} from "../db/workbook-db.js";

// ============================================================================
// Context
// ============================================================================

export interface SQLiteTRPCContext {
  /** Workbook directory path */
  workbookDir: string;
  /** Callback when schema changes (DDL executed) */
  onSchemaChange?: () => Promise<void>;
}

// ============================================================================
// tRPC Setup
// ============================================================================

const t = initTRPC.context<SQLiteTRPCContext>().create();
const publicProcedure = t.procedure;

// ============================================================================
// Input Schemas
// ============================================================================

const queryInput = z.object({
  sql: z.string(),
  params: z.array(z.unknown()).optional(),
});

const dropTableInput = z.object({
  tableName: z.string(),
});

// ============================================================================
// Helpers
// ============================================================================

function isDDL(sql: string): boolean {
  const ddlKeywords = ["CREATE", "ALTER", "DROP", "TRUNCATE"];
  const upperSql = sql.trim().toUpperCase();
  return ddlKeywords.some((kw) => upperSql.startsWith(kw));
}

// ============================================================================
// Router
// ============================================================================

export const sqliteTRPCRouter = t.router({
  /**
   * Execute a read-only SELECT query (useQuery - cached/deduplicated)
   * Used by LiveValue for reactive data display
   */
  select: publicProcedure.input(queryInput).query(async ({ ctx, input }) => {
    // Validate it's a SELECT query
    const upperSql = input.sql.trim().toUpperCase();
    if (!upperSql.startsWith("SELECT") && !upperSql.startsWith("PRAGMA")) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "db.select only allows SELECT queries. Use db.query for mutations.",
      });
    }

    try {
      const db = getWorkbookDb(ctx.workbookDir);
      const result = executeQuery(db, input.sql, input.params);
      return {
        rows: result.rows,
        rowCount: result.rows.length,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Database query failed: ${message}`,
      });
    }
  }),

  /** Execute a SQL query/mutation (useMutation - not cached) */
  query: publicProcedure.input(queryInput).mutation(async ({ ctx, input }) => {
    try {
      const db = getWorkbookDb(ctx.workbookDir);
      const result = executeQuery(db, input.sql, input.params);

      // Trigger schema regeneration if DDL detected
      if (isDDL(input.sql) && ctx.onSchemaChange) {
        ctx.onSchemaChange().catch(console.error);
      }

      return {
        rows: result.rows,
        rowCount: result.rows.length,
        changes: result.changes,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Database query failed: ${message}`,
      });
    }
  }),

  /** List all tables */
  tables: publicProcedure.query(async ({ ctx }) => {
    try {
      const db = getWorkbookDb(ctx.workbookDir);
      const schema = getSchema(db);
      return schema.tables.map((t) => ({ name: t.name }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Failed to list tables: ${message}`,
      });
    }
  }),

  /** Get detailed schema for all tables */
  schema: publicProcedure.query(async ({ ctx }) => {
    try {
      const db = getWorkbookDb(ctx.workbookDir);
      const schema = getSchema(db);
      return schema.tables.map((t) => ({
        table_name: t.name,
        columns: t.columns.map((c) => ({
          name: c.name,
          type: c.type,
          nullable: c.nullable,
        })),
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Failed to get schema: ${message}`,
      });
    }
  }),

  /** Drop a table */
  dropTable: publicProcedure.input(dropTableInput).mutation(async ({ ctx, input }) => {
    // Sanitize table name
    const safeName = input.tableName.replace(/[^a-zA-Z0-9_]/g, "");
    if (safeName !== input.tableName) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Invalid table name",
      });
    }

    try {
      const db = getWorkbookDb(ctx.workbookDir);
      executeQuery(db, `DROP TABLE IF EXISTS "${safeName}"`);

      // Trigger schema regeneration
      if (ctx.onSchemaChange) {
        await ctx.onSchemaChange();
      }

      return { success: true, tableName: safeName };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Failed to drop table: ${message}`,
      });
    }
  }),

  /** Health check - is database accessible? */
  health: publicProcedure.query(async ({ ctx }) => {
    try {
      const db = getWorkbookDb(ctx.workbookDir);
      // Simple query to verify database is accessible
      executeQuery(db, "SELECT 1");
      return { ready: true };
    } catch {
      return { ready: false };
    }
  }),
});

export type SQLiteTRPCRouter = typeof sqliteTRPCRouter;

// ============================================================================
// SSE Subscription for Live Queries
// ============================================================================

export interface DbChangeEvent {
  type: "change" | "connected";
  dataVersion: number;
  timestamp: number;
}

export interface DbSubscriptionState {
  lastDataVersion: number;
  clients: Set<ReadableStreamDefaultController>;
}

/**
 * Create a subscription manager for database changes
 */
export function createDbSubscriptionManager(workbookDir: string) {
  const state: DbSubscriptionState = {
    lastDataVersion: 0,
    clients: new Set(),
  };

  let pollInterval: ReturnType<typeof setInterval> | null = null;

  /**
   * Poll SQLite for data_version changes
   */
  async function pollForChanges() {
    try {
      const db = getWorkbookDb(workbookDir);
      const result = executeQuery(db, "PRAGMA data_version");
      const currentVersion = (result.rows[0] as { data_version: number })?.data_version ?? 0;

      if (currentVersion !== state.lastDataVersion && state.lastDataVersion !== 0) {
        // Data changed - notify all clients
        const event: DbChangeEvent = {
          type: "change",
          dataVersion: currentVersion,
          timestamp: Date.now(),
        };
        broadcast(event);
      }

      state.lastDataVersion = currentVersion;
    } catch {
      // Ignore errors during polling
    }
  }

  /**
   * Broadcast event to all connected clients
   */
  function broadcast(event: DbChangeEvent) {
    const data = `data: ${JSON.stringify(event)}\n\n`;
    for (const controller of state.clients) {
      try {
        controller.enqueue(new TextEncoder().encode(data));
      } catch {
        // Client disconnected, remove from set
        state.clients.delete(controller);
      }
    }
  }

  /**
   * Start polling if not already running
   */
  function startPolling() {
    if (pollInterval) return;
    pollInterval = setInterval(pollForChanges, 500); // Poll every 500ms
    pollForChanges(); // Initial poll
  }

  /**
   * Stop polling if no clients connected
   */
  function maybeStopPolling() {
    if (state.clients.size === 0 && pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  }

  /**
   * Create SSE stream for a new client
   */
  function createStream(): ReadableStream {
    let controller: ReadableStreamDefaultController;

    return new ReadableStream({
      start(ctrl) {
        controller = ctrl;
        state.clients.add(controller);
        startPolling();

        // Send initial connection event
        const initEvent = `data: ${JSON.stringify({ type: "connected", dataVersion: state.lastDataVersion })}\n\n`;
        controller.enqueue(new TextEncoder().encode(initEvent));
      },
      cancel() {
        state.clients.delete(controller);
        maybeStopPolling();
      },
    });
  }

  return { createStream, broadcast };
}

// Global subscription manager (lazily initialized per workbook)
const subscriptionManagers = new Map<string, ReturnType<typeof createDbSubscriptionManager>>();

/**
 * Get or create the subscription manager for a workbook
 */
export function getDbSubscriptionManager(workbookDir: string) {
  let manager = subscriptionManagers.get(workbookDir);
  if (!manager) {
    manager = createDbSubscriptionManager(workbookDir);
    subscriptionManagers.set(workbookDir, manager);
  }
  return manager;
}
