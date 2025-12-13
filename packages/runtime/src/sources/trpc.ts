/**
 * tRPC Router for Sources
 *
 * Type-safe API for source management and table CRUD.
 * Used by desktop app for end-to-end type safety.
 */

import type { PGlite } from "@electric-sql/pglite";
import { initTRPC, TRPCError } from "@trpc/server";
import { z } from "zod";
import { getSyncManager } from "../sync/manager.js";
import { createSource, introspectRemotePostgres, listRemoteTables } from "./create.js";
import { discoverSources, introspectTables } from "./discovery.js";

// ============================================================================
// Context
// ============================================================================

export interface TRPCContext {
  workbookDir: string;
  db: PGlite | null;
  isDbReady: boolean;
}

// ============================================================================
// tRPC Setup
// ============================================================================

const t = initTRPC.context<TRPCContext>().create();

const publicProcedure = t.procedure;

// Middleware to ensure DB is ready
const dbProcedure = publicProcedure.use(async ({ ctx, next }) => {
  if (!ctx.isDbReady || !ctx.db) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Database not ready",
    });
  }
  return next({
    ctx: {
      ...ctx,
      db: ctx.db,
    },
  });
});

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
    /** List all discovered sources */
    list: dbProcedure.query(async ({ ctx }) => {
      const sources = await discoverSources(ctx.workbookDir, ctx.db);
      return sources.map((s) => ({
        id: s.id,
        path: s.path,
        tables: s.tables.length,
      }));
    }),

    /** Get a specific source */
    get: dbProcedure.input(z.object({ source: z.string() })).query(async ({ ctx, input }) => {
      const sources = await discoverSources(ctx.workbookDir, ctx.db);
      const source = sources.find((s) => s.id === input.source);
      if (!source) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Source not found" });
      }
      return source;
    }),

    /** Create a new source */
    create: dbProcedure.input(createSourceInput).mutation(async ({ ctx, input }) => {
      const result = await createSource(ctx.workbookDir, ctx.db, input);
      if (!result.success) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: result.error ?? "Failed to create source",
        });
      }
      return result;
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
  // Table CRUD
  // ==================

  tables: t.router({
    /** List all tables in the database */
    listAll: dbProcedure.query(async ({ ctx }) => {
      const tables = await introspectTables(ctx.db);
      return tables.map((t) => ({
        name: t.name,
        columnCount: t.schema.columns.length,
        primaryKey: t.schema.primaryKey,
      }));
    }),

    /** Get table schema */
    schema: dbProcedure.input(z.object({ table: z.string() })).query(async ({ ctx, input }) => {
      const tables = await introspectTables(ctx.db);
      const table = tables.find((t) => t.name === input.table);
      if (!table) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Table not found" });
      }
      return table.schema;
    }),

    /** List rows from a table with pagination */
    list: dbProcedure.input(listTablesInput).query(async ({ ctx, input }) => {
      const { table, limit, offset, sort, select } = input;

      // Validate table exists
      const tables = await introspectTables(ctx.db);
      if (!tables.find((t) => t.name === table)) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Table not found" });
      }

      // Build SELECT clause
      const selectClause = select?.length ? select.join(", ") : "*";

      // Build ORDER BY clause
      let orderClause = "";
      if (sort) {
        const [column, direction] = sort.split(":");
        const dir = direction?.toLowerCase() === "desc" ? "DESC" : "ASC";
        orderClause = `ORDER BY ${column} ${dir}`;
      }

      // Execute query
      const query = `SELECT ${selectClause} FROM ${table} ${orderClause} LIMIT ${limit} OFFSET ${offset}`;
      const result = await ctx.db.query(query);

      // Get total count
      const countResult = await ctx.db.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM ${table}`,
      );
      const total = parseInt(countResult.rows[0]?.count ?? "0", 10);

      return {
        rows: result.rows,
        total,
        limit,
        offset,
      };
    }),

    /** Get a single row by ID */
    get: dbProcedure.input(getRowInput).query(async ({ ctx, input }) => {
      const { table, id } = input;

      // Get primary key column
      const tables = await introspectTables(ctx.db);
      const tableInfo = tables.find((t) => t.name === table);
      if (!tableInfo) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Table not found" });
      }

      const pkColumn = tableInfo.schema.primaryKey?.[0] ?? "id";
      const result = await ctx.db.query(`SELECT * FROM ${table} WHERE ${pkColumn} = $1`, [id]);

      if (result.rows.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Row not found" });
      }

      return result.rows[0];
    }),

    /** Create a new row */
    create: dbProcedure.input(createRowInput).mutation(async ({ ctx, input }) => {
      const { table, data } = input;

      const columns = Object.keys(data);
      const values = Object.values(data);
      const placeholders = columns.map((_, i) => `$${i + 1}`);

      const query = `
          INSERT INTO ${table} (${columns.join(", ")})
          VALUES (${placeholders.join(", ")})
          RETURNING *
        `;

      try {
        const result = await ctx.db.query(query, values);
        return result.rows[0];
      } catch (err) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: err instanceof Error ? err.message : "Insert failed",
        });
      }
    }),

    /** Update a row */
    update: dbProcedure.input(updateRowInput).mutation(async ({ ctx, input }) => {
      const { table, id, data } = input;

      // Get primary key column
      const tables = await introspectTables(ctx.db);
      const tableInfo = tables.find((t) => t.name === table);
      if (!tableInfo) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Table not found" });
      }

      const pkColumn = tableInfo.schema.primaryKey?.[0] ?? "id";

      const columns = Object.keys(data);
      const values = Object.values(data);
      const setClause = columns.map((col, i) => `${col} = $${i + 1}`).join(", ");

      const query = `
          UPDATE ${table}
          SET ${setClause}
          WHERE ${pkColumn} = $${columns.length + 1}
          RETURNING *
        `;

      try {
        const result = await ctx.db.query(query, [...values, id]);
        if (result.rows.length === 0) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Row not found" });
        }
        return result.rows[0];
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: err instanceof Error ? err.message : "Update failed",
        });
      }
    }),

    /** Delete a row */
    delete: dbProcedure.input(deleteRowInput).mutation(async ({ ctx, input }) => {
      const { table, id } = input;

      // Get primary key column
      const tables = await introspectTables(ctx.db);
      const tableInfo = tables.find((t) => t.name === table);
      if (!tableInfo) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Table not found" });
      }

      const pkColumn = tableInfo.schema.primaryKey?.[0] ?? "id";

      const result = await ctx.db.query(`DELETE FROM ${table} WHERE ${pkColumn} = $1 RETURNING *`, [
        id,
      ]);

      if (result.rows.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Row not found" });
      }

      return { deleted: true, row: result.rows[0] };
    }),

    /** Bulk update multiple rows */
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

        // Get primary key column
        const tables = await introspectTables(ctx.db);
        const tableInfo = tables.find((t) => t.name === table);
        if (!tableInfo) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Table not found" });
        }

        const pkColumn = tableInfo.schema.primaryKey?.[0] ?? "id";
        const results: unknown[] = [];

        // Execute updates in a transaction-like manner
        for (const update of updates) {
          const columns = Object.keys(update.data);
          const values = Object.values(update.data);
          const setClause = columns.map((col, i) => `${col} = $${i + 1}`).join(", ");

          const query = `
            UPDATE ${table}
            SET ${setClause}
            WHERE ${pkColumn} = $${columns.length + 1}
            RETURNING *
          `;

          const result = await ctx.db.query(query, [...values, update.id]);
          if (result.rows[0]) {
            results.push(result.rows[0]);
          }
        }

        return { updated: results.length, rows: results };
      }),
  }),

  // ==================
  // Subscriptions (Electric-SQL)
  // ==================

  subscriptions: t.router({
    /** Get subscription status for a table */
    status: dbProcedure
      .input(z.object({ source: z.string(), table: z.string() }))
      .query(async ({ ctx, input }) => {
        try {
          const syncManager = getSyncManager({
            db: ctx.db,
            workbookDir: ctx.workbookDir,
          });
          return syncManager.getStatus(input.source, input.table);
        } catch {
          return {
            active: false,
            shapeId: undefined,
            lastSyncAt: undefined,
            rowCount: undefined,
            error: undefined,
          };
        }
      }),

    /** Start subscription for a table */
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
      .mutation(async ({ ctx, input }) => {
        const syncManager = getSyncManager({
          db: ctx.db,
          workbookDir: ctx.workbookDir,
        });

        // Get subscription config from source definition if not provided
        let config = input.config;
        if (!config) {
          const sources = await discoverSources(ctx.workbookDir, ctx.db);
          const source = sources.find((s) => s.id === input.source);
          const tableDef = source?.definition.tables?.[input.table];
          if (!tableDef?.subscription) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `No subscription config found for ${input.source}.${input.table}`,
            });
          }
          config = tableDef.subscription;
        }

        return syncManager.startSubscription(input.source, input.table, config!);
      }),

    /** Stop subscription for a table */
    stop: dbProcedure
      .input(z.object({ source: z.string(), table: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const syncManager = getSyncManager({
          db: ctx.db,
          workbookDir: ctx.workbookDir,
        });
        await syncManager.stopSubscription(input.source, input.table);
        return { stopped: true };
      }),

    /** Get all active subscriptions */
    listActive: dbProcedure.query(async ({ ctx }) => {
      try {
        const syncManager = getSyncManager({
          db: ctx.db,
          workbookDir: ctx.workbookDir,
        });
        return syncManager.getActiveSubscriptions();
      } catch {
        return [];
      }
    }),

    /** Get sync statistics */
    stats: dbProcedure.query(async ({ ctx }) => {
      try {
        const syncManager = getSyncManager({
          db: ctx.db,
          workbookDir: ctx.workbookDir,
        });
        return syncManager.getStats();
      } catch {
        return { total: 0, active: 0, errored: 0, inactive: 0 };
      }
    }),
  }),
});

// Export router type for client
export type SourcesRouter = typeof sourcesRouter;
