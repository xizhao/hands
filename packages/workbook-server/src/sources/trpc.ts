/**
 * tRPC Router for Sources
 *
 * Type-safe API for source management and table CRUD.
 * Used by desktop app for end-to-end type safety.
 *
 * NOTE: Database operations are being migrated from PGlite to SQLite (via runtime).
 * Some procedures are temporarily disabled during this transition.
 */

import { initTRPC, TRPCError } from "@trpc/server";
import { z } from "zod";
import { introspectRemotePostgres, listRemoteTables } from "./create.js";

// ============================================================================
// Context
// ============================================================================

export interface TRPCContext {
  workbookDir: string;
  isDbReady: boolean;
  /** Runtime URL for db access */
  runtimeUrl: string;
}

// ============================================================================
// tRPC Setup
// ============================================================================

const t = initTRPC.context<TRPCContext>().create();

const publicProcedure = t.procedure;

// Middleware to ensure DB is ready (via runtime SQLite)
const dbProcedure = publicProcedure.use(async ({ ctx, next }) => {
  if (!ctx.isDbReady) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Database not ready",
    });
  }
  return next({ ctx });
});

// ============================================================================
// Runtime DB Helpers
// ============================================================================

interface RuntimeSchema {
  tables: Array<{
    name: string;
    columns: Array<{
      name: string;
      type: string;
      nullable: boolean;
      isPrimary: boolean;
    }>;
  }>;
}

async function fetchSchema(runtimeUrl: string): Promise<RuntimeSchema> {
  const response = await fetch(`${runtimeUrl}/db/schema`);
  if (!response.ok) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Failed to get schema: ${await response.text()}`,
    });
  }
  return response.json();
}

async function executeQuery(
  runtimeUrl: string,
  sql: string,
): Promise<{ rows: unknown[]; changes?: number }> {
  const response = await fetch(`${runtimeUrl}/db/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sql }),
  });
  if (!response.ok) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Query failed: ${await response.text()}`,
    });
  }
  return response.json();
}

// ============================================================================
// Input Schemas
// ============================================================================

const listTablesInput = z.object({
  source: z.string().optional(),
  table: z.string(),
  limit: z.number().min(1).max(10000).default(100),
  offset: z.number().min(0).default(0),
  sort: z.string().optional(),
  filter: z.record(z.unknown()).optional(),
  select: z.array(z.string()).optional(),
});

const getRowInput = z.object({
  source: z.string().optional(),
  table: z.string(),
  id: z.string(),
});

const createRowInput = z.object({
  source: z.string().optional(),
  table: z.string(),
  data: z.record(z.unknown()),
});

const updateRowInput = z.object({
  source: z.string().optional(),
  table: z.string(),
  id: z.string(),
  data: z.record(z.unknown()),
});

const deleteRowInput = z.object({
  source: z.string().optional(),
  table: z.string(),
  id: z.string(),
});

const createSourceInput = z.object({
  name: z.string().regex(/^[a-z][a-z0-9_-]*$/, "Must start with lowercase letter"),
  from: z.string().optional(),
  tables: z.array(z.string()).optional(),
  where: z.string().optional(),
  description: z.string().optional(),
});

// ============================================================================
// Router
// ============================================================================

export const sourcesRouter = t.router({
  // ==================
  // Source Management
  // ==================

  sources: t.router({
    /** List all discovered sources - NOTE: Migrating to SQLite */
    list: dbProcedure.query(async (): Promise<{ id: string; path: string; tables: number }[]> => {
      throw new TRPCError({
        code: "NOT_IMPLEMENTED",
        message: "Sources discovery migrating to SQLite",
      });
    }),

    /** Get a specific source - NOTE: Migrating to SQLite */
    get: dbProcedure.input(z.object({ source: z.string() })).query(async (): Promise<{
      id: string;
      path: string;
      tables: { name: string }[];
      definition: Record<string, unknown>;
    }> => {
      throw new TRPCError({
        code: "NOT_IMPLEMENTED",
        message: "Sources discovery migrating to SQLite",
      });
    }),

    /** Create a new source - NOTE: Migrating to SQLite */
    create: dbProcedure.input(createSourceInput).mutation(async (): Promise<{ success: boolean; error?: string; sourcePath?: string }> => {
      throw new TRPCError({
        code: "NOT_IMPLEMENTED",
        message: "Source creation migrating to SQLite",
      });
    }),

    /** List tables in remote Postgres (for source creation UI) */
    listRemoteTables: publicProcedure
      .input(z.object({ connectionString: z.string() }))
      .query(async ({ input }) => {
        const result = await listRemoteTables(input.connectionString);
        if (!result.success) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: result.error ?? "Failed to connect",
          });
        }
        return result.tables ?? [];
      }),

    /** Introspect remote Postgres table schema */
    introspectRemote: publicProcedure
      .input(
        z.object({
          connectionString: z.string(),
          tables: z.array(z.string()),
        }),
      )
      .query(async ({ input }) => {
        const result = await introspectRemotePostgres({
          connectionString: input.connectionString,
          tables: input.tables,
        });
        if (!result.success) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: result.error ?? "Failed to introspect",
          });
        }
        return result.tables ?? [];
      }),
  }),

  // ==================
  // Table CRUD (proxies to runtime /db/* endpoints)
  // ==================

  tables: t.router({
    /** List all tables */
    listAll: dbProcedure.query(async ({ ctx }) => {
      const schema = await fetchSchema(ctx.runtimeUrl);
      return schema.tables.map((t) => ({
        name: t.name,
        columnCount: t.columns.length,
        primaryKey: t.columns.filter((c) => c.isPrimary).map((c) => c.name),
      }));
    }),

    /** Get table schema */
    schema: dbProcedure.input(z.object({ table: z.string() })).query(async ({ ctx, input }) => {
      const schema = await fetchSchema(ctx.runtimeUrl);
      const table = schema.tables.find((t) => t.name === input.table);
      if (!table) {
        throw new TRPCError({ code: "NOT_FOUND", message: `Table ${input.table} not found` });
      }
      return {
        columns: table.columns.map((c) => ({
          name: c.name,
          type: c.type,
          nullable: c.nullable,
          isPrimaryKey: c.isPrimary,
        })),
        primaryKey: table.columns.filter((c) => c.isPrimary).map((c) => c.name),
      };
    }),

    /** List rows */
    list: dbProcedure.input(listTablesInput).query(async ({ ctx, input }) => {
      const { table, limit, offset, sort, select } = input;
      const cols = select?.length ? select.map((c) => `"${c}"`).join(", ") : "*";
      let sql = `SELECT ${cols} FROM "${table}"`;
      if (sort) sql += ` ORDER BY "${sort}"`;
      sql += ` LIMIT ${limit} OFFSET ${offset}`;

      const result = await executeQuery(ctx.runtimeUrl, sql);
      const countResult = await executeQuery(ctx.runtimeUrl, `SELECT COUNT(*) as count FROM "${table}"`);
      const total = (countResult.rows[0] as { count: number })?.count ?? 0;

      return {
        rows: result.rows as Record<string, unknown>[],
        total,
        limit,
        offset,
      };
    }),

    /** Get a single row */
    get: dbProcedure.input(getRowInput).query(async ({ ctx, input }) => {
      const { table, id } = input;
      const result = await executeQuery(ctx.runtimeUrl, `SELECT * FROM "${table}" WHERE id = '${id}' LIMIT 1`);
      if (!result.rows[0]) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Row not found" });
      }
      return result.rows[0] as Record<string, unknown>;
    }),

    /** Create a new row */
    create: dbProcedure.input(createRowInput).mutation(async ({ ctx, input }) => {
      const { table, data } = input;
      const keys = Object.keys(data);
      const values = Object.values(data).map((v) => (typeof v === "string" ? `'${v}'` : v));
      const sql = `INSERT INTO "${table}" (${keys.map((k) => `"${k}"`).join(", ")}) VALUES (${values.join(", ")}) RETURNING *`;
      const result = await executeQuery(ctx.runtimeUrl, sql);
      return (result.rows[0] ?? {}) as Record<string, unknown>;
    }),

    /** Update a row */
    update: dbProcedure.input(updateRowInput).mutation(async ({ ctx, input }) => {
      const { table, id, data } = input;
      const sets = Object.entries(data)
        .map(([k, v]) => `"${k}" = ${typeof v === "string" ? `'${v}'` : v}`)
        .join(", ");
      const sql = `UPDATE "${table}" SET ${sets} WHERE id = '${id}' RETURNING *`;
      const result = await executeQuery(ctx.runtimeUrl, sql);
      return (result.rows[0] ?? {}) as Record<string, unknown>;
    }),

    /** Delete a row */
    delete: dbProcedure.input(deleteRowInput).mutation(async ({ ctx, input }) => {
      const { table, id } = input;
      const result = await executeQuery(ctx.runtimeUrl, `DELETE FROM "${table}" WHERE id = '${id}' RETURNING *`);
      return {
        deleted: result.rows.length > 0,
        row: (result.rows[0] as Record<string, unknown>) ?? null,
      };
    }),

    /** Bulk update */
    bulkUpdate: dbProcedure
      .input(
        z.object({
          table: z.string(),
          updates: z.array(
            z.object({
              id: z.string(),
              data: z.record(z.unknown()),
            }),
          ),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const { table, updates } = input;
        const rows: Record<string, unknown>[] = [];
        for (const { id, data } of updates) {
          const sets = Object.entries(data)
            .map(([k, v]) => `"${k}" = ${typeof v === "string" ? `'${v}'` : v}`)
            .join(", ");
          const sql = `UPDATE "${table}" SET ${sets} WHERE id = '${id}' RETURNING *`;
          const result = await executeQuery(ctx.runtimeUrl, sql);
          if (result.rows[0]) rows.push(result.rows[0] as Record<string, unknown>);
        }
        return { updated: rows.length, rows };
      }),
  }),

  // ==================
  // Subscriptions - Electric-SQL sync is disabled during SQLite migration
  // ==================

  subscriptions: t.router({
    /** Get subscription status - Disabled during migration */
    status: dbProcedure
      .input(z.object({ source: z.string(), table: z.string() }))
      .query(async () => {
        return {
          active: false,
          shapeId: undefined,
          lastSyncAt: undefined,
          rowCount: undefined,
          error: "Subscriptions disabled during SQLite migration",
        };
      }),

    /** Start subscription - Disabled during migration */
    start: dbProcedure
      .input(
        z.object({
          source: z.string(),
          table: z.string(),
          config: z
            .object({
              url: z.string(),
              table: z.string(),
              where: z.string().optional(),
              columns: z.array(z.string()).optional(),
            })
            .optional(),
        }),
      )
      .mutation(async () => {
        throw new TRPCError({
          code: "NOT_IMPLEMENTED",
          message: "Subscriptions disabled during SQLite migration",
        });
      }),

    /** Stop subscription - Disabled during migration */
    stop: dbProcedure
      .input(z.object({ source: z.string(), table: z.string() }))
      .mutation(async () => {
        return { stopped: true };
      }),

    /** Get all active subscriptions - Returns empty during migration */
    listActive: dbProcedure.query(async () => {
      return [];
    }),

    /** Get sync statistics - Returns zeros during migration */
    stats: dbProcedure.query(async () => {
      return { total: 0, active: 0, errored: 0, inactive: 0 };
    }),
  }),
});

// Export router type for client
export type SourcesRouter = typeof sourcesRouter;
