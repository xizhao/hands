/**
 * tRPC Router for Database Operations
 *
 * Type-safe API for database queries, schema inspection, and persistence.
 */

import type { PGlite } from "@electric-sql/pglite";
import { initTRPC, TRPCError } from "@trpc/server";
import { z } from "zod";

// ============================================================================
// Context
// ============================================================================

export interface DbContext {
  workbookDir: string;
  db: PGlite | null;
  isDbReady: boolean;
  saveDb: () => Promise<void>;
  onDdlQuery?: () => Promise<void>;
}

// ============================================================================
// tRPC Setup
// ============================================================================

const t = initTRPC.context<DbContext>().create();

const dbReadyProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.isDbReady || !ctx.db) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Database not ready",
    });
  }
  return next({ ctx: { ...ctx, db: ctx.db } });
});

// ============================================================================
// Input Schemas
// ============================================================================

const queryInput = z.object({
  query: z.string(),
  params: z.array(z.unknown()).optional(),
});

const dropTableInput = z.object({
  tableName: z.string(),
});

// ============================================================================
// Helpers
// ============================================================================

function isDDL(query: string): boolean {
  const ddlKeywords = ["CREATE", "ALTER", "DROP", "TRUNCATE"];
  const upperQuery = query.trim().toUpperCase();
  return ddlKeywords.some((kw) => upperQuery.startsWith(kw));
}

// ============================================================================
// Router
// ============================================================================

export const dbRouter = t.router({
  /** Execute a SQL query */
  query: dbReadyProcedure
    .input(queryInput)
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db.query(input.query, input.params);

      // Trigger schema regeneration if DDL detected
      if (isDDL(input.query) && ctx.onDdlQuery) {
        ctx.onDdlQuery().catch(console.error);
      }

      return {
        rows: result.rows as unknown[],
        rowCount: result.rows.length,
      };
    }),

  /** Save database snapshot to disk */
  save: dbReadyProcedure.mutation(async ({ ctx }) => {
    await ctx.saveDb();
    return { success: true };
  }),

  /** List all public tables */
  tables: dbReadyProcedure.query(async ({ ctx }) => {
    const result = await ctx.db.query<{ name: string }>(`
      SELECT tablename as name
      FROM pg_catalog.pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename
    `);
    return result.rows;
  }),

  /** Get detailed schema for all tables */
  schema: dbReadyProcedure.query(async ({ ctx }) => {
    const result = await ctx.db.query<{
      table_name: string;
      column_name: string;
      data_type: string;
      is_nullable: string;
    }>(`
      SELECT
        c.table_name,
        c.column_name,
        c.data_type,
        c.is_nullable
      FROM information_schema.columns c
      JOIN information_schema.tables t
        ON c.table_name = t.table_name
      WHERE t.table_schema = 'public'
        AND t.table_type = 'BASE TABLE'
      ORDER BY c.table_name, c.ordinal_position
    `);

    // Group by table
    const tables = new Map<string, { name: string; type: string; nullable: boolean }[]>();
    for (const row of result.rows) {
      if (!tables.has(row.table_name)) {
        tables.set(row.table_name, []);
      }
      tables.get(row.table_name)!.push({
        name: row.column_name,
        type: row.data_type,
        nullable: row.is_nullable === "YES",
      });
    }

    return Array.from(tables.entries()).map(([table_name, columns]) => ({
      table_name,
      columns,
    }));
  }),

  /** Drop a table */
  dropTable: dbReadyProcedure
    .input(dropTableInput)
    .mutation(async ({ ctx, input }) => {
      // Sanitize table name to prevent SQL injection
      const safeName = input.tableName.replace(/[^a-zA-Z0-9_]/g, "");
      if (safeName !== input.tableName) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid table name",
        });
      }

      await ctx.db.query(`DROP TABLE IF EXISTS "${safeName}" CASCADE`);

      // Trigger schema regeneration
      if (ctx.onDdlQuery) {
        await ctx.onDdlQuery();
      }

      return { success: true, tableName: safeName };
    }),
});

export type DbRouter = typeof dbRouter;
