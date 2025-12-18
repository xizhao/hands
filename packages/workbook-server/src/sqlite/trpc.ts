/**
 * SQLite tRPC Router
 *
 * Type-safe API for database operations via the runtime's SQLite.
 * The runtime manages the actual SQLite database via Durable Objects.
 * This router communicates with the runtime over HTTP.
 */

import { initTRPC, TRPCError } from "@trpc/server";
import { z } from "zod";

// ============================================================================
// Context
// ============================================================================

export interface SQLiteTRPCContext {
  /** Runtime URL (e.g., http://localhost:5173) */
  runtimeUrl: string;
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

interface RuntimeQueryResult {
  rows: unknown[];
  changes?: number;
  lastInsertRowid?: number;
}

/**
 * Execute SQL via runtime's query endpoint
 */
async function executeQuery(
  runtimeUrl: string,
  sql: string,
  params?: unknown[]
): Promise<RuntimeQueryResult> {
  const response = await fetch(`${runtimeUrl}/db/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sql, params }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Database query failed: ${error}`,
    });
  }

  return response.json() as Promise<RuntimeQueryResult>;
}

/**
 * Get schema info via runtime's schema endpoint
 */
async function getSchema(runtimeUrl: string): Promise<{
  tables: Array<{
    name: string;
    columns: Array<{
      name: string;
      type: string;
      nullable: boolean;
      isPrimary: boolean;
    }>;
  }>;
}> {
  const response = await fetch(`${runtimeUrl}/db/schema`);

  if (!response.ok) {
    const error = await response.text();
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Failed to get schema: ${error}`,
    });
  }

  return response.json();
}

// ============================================================================
// Router
// ============================================================================

export const sqliteTRPCRouter = t.router({
  /** Execute a SQL query */
  query: publicProcedure.input(queryInput).mutation(async ({ ctx, input }) => {
    const result = await executeQuery(ctx.runtimeUrl, input.sql, input.params);

    // Trigger schema regeneration if DDL detected
    if (isDDL(input.sql) && ctx.onSchemaChange) {
      ctx.onSchemaChange().catch(console.error);
    }

    return {
      rows: result.rows,
      rowCount: result.rows.length,
      changes: result.changes,
    };
  }),

  /** List all tables */
  tables: publicProcedure.query(async ({ ctx }) => {
    const schema = await getSchema(ctx.runtimeUrl);
    return schema.tables.map((t) => ({ name: t.name }));
  }),

  /** Get detailed schema for all tables */
  schema: publicProcedure.query(async ({ ctx }) => {
    const schema = await getSchema(ctx.runtimeUrl);
    return schema.tables.map((t) => ({
      table_name: t.name,
      columns: t.columns.map((c) => ({
        name: c.name,
        type: c.type,
        nullable: c.nullable,
      })),
    }));
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

    await executeQuery(ctx.runtimeUrl, `DROP TABLE IF EXISTS "${safeName}"`);

    // Trigger schema regeneration
    if (ctx.onSchemaChange) {
      await ctx.onSchemaChange();
    }

    return { success: true, tableName: safeName };
  }),

  /** Health check - is runtime database reachable? */
  health: publicProcedure.query(async ({ ctx }) => {
    try {
      const response = await fetch(`${ctx.runtimeUrl}/db/health`, {
        method: "GET",
        signal: AbortSignal.timeout(5000),
      });
      return { ready: response.ok };
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
  type: "change";
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
export function createDbSubscriptionManager(runtimeUrl: string) {
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
      const response = await fetch(`${runtimeUrl}/db/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql: "PRAGMA data_version" }),
      });

      if (!response.ok) return;

      const result = (await response.json()) as { rows: Array<{ data_version: number }> };
      const currentVersion = result.rows[0]?.data_version ?? 0;

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

// Global subscription manager (lazily initialized)
let subscriptionManager: ReturnType<typeof createDbSubscriptionManager> | null = null;

/**
 * Get or create the subscription manager
 */
export function getDbSubscriptionManager(runtimeUrl: string) {
  if (!subscriptionManager) {
    subscriptionManager = createDbSubscriptionManager(runtimeUrl);
  }
  return subscriptionManager;
}
