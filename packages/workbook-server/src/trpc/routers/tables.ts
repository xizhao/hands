/**
 * tRPC Router for Table Operations
 *
 * CRUD operations for tables (SQLite tables with associated MDX pages).
 * This is an alias for domains with cleaner naming (tableId instead of domainId).
 */

import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { initTRPC, TRPCError } from "@trpc/server";
import { z } from "zod";
import { executeQuery, getWorkbookDb } from "../../db/workbook-db.js";
import type { PageRegistry } from "../../pages/index.js";
import { discoverDomains, discoverPages } from "../../workbook/discovery.js";

// ============================================================================
// Context (same as DomainsContext)
// ============================================================================

export interface TablesContext {
  workbookDir: string;
  getPageRegistry: () => PageRegistry | null;
  onSchemaChange?: () => Promise<void>;
}

// ============================================================================
// tRPC Setup
// ============================================================================

const t = initTRPC.context<TablesContext>().create();

const publicProcedure = t.procedure;

// ============================================================================
// Input Schemas
// ============================================================================

const tableIdInput = z.object({
  tableId: z.string().min(1),
});

const createInput = z.object({
  name: z
    .string()
    .min(1)
    .regex(/^[a-z][a-z0-9_]*$/, {
      message: "Invalid name - use lowercase, numbers, underscores only, start with letter",
    }),
});

const renameInput = z.object({
  tableId: z.string().min(1),
  newName: z
    .string()
    .min(1)
    .regex(/^[a-z][a-z0-9_]*$/, {
      message: "Invalid name - use lowercase, numbers, underscores only, start with letter",
    }),
});

// ============================================================================
// Router
// ============================================================================

export const tablesRouter = t.router({
  /**
   * List all tables with metadata
   */
  list: publicProcedure.query(async ({ ctx }) => {
    const pagesDir = join(ctx.workbookDir, "pages");
    const pagesResult = await discoverPages(pagesDir);
    const domainsResult = discoverDomains(ctx.workbookDir, pagesResult.items);

    return {
      tables: domainsResult.items,
      errors: domainsResult.errors,
    };
  }),

  /**
   * Get a single table by ID
   */
  get: publicProcedure.input(tableIdInput).query(async ({ ctx, input }) => {
    const pagesDir = join(ctx.workbookDir, "pages");
    const pagesResult = await discoverPages(pagesDir);
    const domainsResult = discoverDomains(ctx.workbookDir, pagesResult.items);

    const table = domainsResult.items.find((d) => d.id === input.tableId);
    if (!table) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: `Table not found: ${input.tableId}`,
      });
    }

    return table;
  }),

  /**
   * Create a new table
   */
  create: publicProcedure.input(createInput).mutation(async ({ ctx, input }) => {
    const { name } = input;
    const tableName = name.replace(/[^a-zA-Z0-9_]/g, "");

    if (tableName !== name) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Invalid name - use lowercase, numbers, underscores only",
      });
    }

    try {
      const db = getWorkbookDb(ctx.workbookDir);

      const tableExists = db
        .query<{ name: string }, [string]>(
          `SELECT name FROM sqlite_master WHERE type='table' AND name=?`
        )
        .get(tableName);

      if (tableExists) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Table already exists: ${tableName}`,
        });
      }

      executeQuery(db, `CREATE TABLE "${tableName}" (id INTEGER PRIMARY KEY AUTOINCREMENT)`);

      if (ctx.onSchemaChange) {
        await ctx.onSchemaChange();
      }

      return {
        success: true,
        tableId: tableName,
      };
    } catch (err) {
      if (err instanceof TRPCError) throw err;
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Failed to create table: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }),

  /**
   * Rename a table
   */
  rename: publicProcedure.input(renameInput).mutation(async ({ ctx, input }) => {
    const { tableId, newName } = input;

    const oldTableName = tableId.replace(/[^a-zA-Z0-9_]/g, "");
    const newTableName = newName.replace(/[^a-zA-Z0-9_]/g, "");

    if (oldTableName !== tableId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Invalid table ID",
      });
    }

    if (newTableName !== newName) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Invalid new name - use lowercase, numbers, underscores only",
      });
    }

    if (oldTableName === newTableName) {
      return { success: true, noChange: true };
    }

    try {
      const db = getWorkbookDb(ctx.workbookDir);

      const tableExists = db
        .query<{ name: string }, [string]>(
          `SELECT name FROM sqlite_master WHERE type='table' AND name=?`
        )
        .get(oldTableName);

      if (!tableExists) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Table not found: ${oldTableName}`,
        });
      }

      const targetExists = db
        .query<{ name: string }, [string]>(
          `SELECT name FROM sqlite_master WHERE type='table' AND name=?`
        )
        .get(newTableName);

      if (targetExists) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Table already exists: ${newTableName}`,
        });
      }

      executeQuery(db, `ALTER TABLE "${oldTableName}" RENAME TO "${newTableName}"`);

      if (ctx.onSchemaChange) {
        await ctx.onSchemaChange();
      }

      return {
        success: true,
        oldName: oldTableName,
        newName: newTableName,
      };
    } catch (err) {
      if (err instanceof TRPCError) throw err;
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Failed to rename table: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }),

  /**
   * Delete a table
   */
  delete: publicProcedure.input(tableIdInput).mutation(async ({ ctx, input }) => {
    const { tableId } = input;
    const tableName = tableId.replace(/[^a-zA-Z0-9_]/g, "");

    if (tableName !== tableId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Invalid table ID",
      });
    }

    try {
      const db = getWorkbookDb(ctx.workbookDir);

      const tableExists = db
        .query<{ name: string }, [string]>(
          `SELECT name FROM sqlite_master WHERE type='table' AND name=?`
        )
        .get(tableName);

      if (!tableExists) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Table not found: ${tableName}`,
        });
      }

      executeQuery(db, `DROP TABLE IF EXISTS "${tableName}"`);

      if (ctx.onSchemaChange) {
        await ctx.onSchemaChange();
      }

      return {
        success: true,
        deletedTable: tableName,
      };
    } catch (err) {
      if (err instanceof TRPCError) throw err;
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Failed to delete table: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }),
});

export type TablesRouter = typeof tablesRouter;
