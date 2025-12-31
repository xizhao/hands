/**
 * tRPC Router for Domain Operations
 *
 * CRUD operations for domains (tables as first-class entities).
 * Domains are non-relation SQLite tables with associated MDX pages.
 *
 * - list: Get all domains with metadata
 * - rename: Rename table + update associated page
 * - delete: Drop table with CASCADE + delete associated page
 */

import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { initTRPC, TRPCError } from "@trpc/server";
import { z } from "zod";
import { executeQuery, getWorkbookDb } from "../../db/workbook-db.js";
import type { PageRegistry } from "../../pages/index.js";
import { discoverDomains, discoverPages } from "../../workbook/discovery.js";

// ============================================================================
// Context
// ============================================================================

export interface DomainsContext {
  workbookDir: string;
  /** Page registry for page operations */
  getPageRegistry: () => PageRegistry | null;
  /** Called when schema changes (DDL executed) */
  onSchemaChange?: () => Promise<void>;
}

// ============================================================================
// tRPC Setup
// ============================================================================

const t = initTRPC.context<DomainsContext>().create();

const publicProcedure = t.procedure;

// ============================================================================
// Input Schemas
// ============================================================================

const domainIdInput = z.object({
  domainId: z.string().min(1),
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
  domainId: z.string().min(1),
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

export const domainsRouter = t.router({
  /**
   * List all domains (non-relation tables with metadata)
   */
  list: publicProcedure.query(async ({ ctx }) => {
    const pagesDir = join(ctx.workbookDir, "pages");

    // Discover pages first (needed for matching)
    const pagesResult = await discoverPages(pagesDir);

    // Discover domains from database
    const domainsResult = discoverDomains(ctx.workbookDir, pagesResult.items);

    return {
      domains: domainsResult.items,
      errors: domainsResult.errors,
    };
  }),

  /**
   * Get a single domain by ID
   */
  get: publicProcedure.input(domainIdInput).query(async ({ ctx, input }) => {
    const pagesDir = join(ctx.workbookDir, "pages");
    const pagesResult = await discoverPages(pagesDir);
    const domainsResult = discoverDomains(ctx.workbookDir, pagesResult.items);

    const domain = domainsResult.items.find((d) => d.id === input.domainId);
    if (!domain) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: `Domain not found: ${input.domainId}`,
      });
    }

    return domain;
  }),

  /**
   * Create a new domain (table + page)
   *
   * Steps:
   * 1. Create SQLite table with id column
   * 2. Create associated MDX page file
   * 3. Trigger schema regeneration
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

      // Check if table already exists
      const tableExists = db
        .query<{ name: string }, [string]>(
          `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
        )
        .get(tableName);

      if (tableExists) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Table already exists: ${tableName}`,
        });
      }

      // Create table with id column
      executeQuery(db, `CREATE TABLE "${tableName}" (id INTEGER PRIMARY KEY AUTOINCREMENT)`);

      // Create associated page file
      const pagesDir = join(ctx.workbookDir, "pages");
      const pageSlug = tableName.replace(/_/g, "-");
      const pagePath = join(pagesDir, `${pageSlug}.mdx`);

      // Format title from table name
      const title = tableName
        .split("_")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");

      const pageContent = `---
title: ${title}
---

`;

      // Ensure pages directory exists
      const { mkdirSync, writeFileSync } = await import("node:fs");
      mkdirSync(pagesDir, { recursive: true });
      writeFileSync(pagePath, pageContent, "utf-8");

      // Reload page registry
      const pageRegistry = ctx.getPageRegistry();
      if (pageRegistry) {
        await pageRegistry.load();
      }

      // Trigger schema regeneration
      if (ctx.onSchemaChange) {
        await ctx.onSchemaChange();
      }

      return {
        success: true,
        domainId: tableName,
        pageSlug,
      };
    } catch (err) {
      if (err instanceof TRPCError) throw err;
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Failed to create domain: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }),

  /**
   * Rename a domain (table + associated page)
   *
   * Steps:
   * 1. Rename SQLite table using ALTER TABLE
   * 2. Rename associated page file if exists
   * 3. Trigger schema regeneration
   */
  rename: publicProcedure.input(renameInput).mutation(async ({ ctx, input }) => {
    const { domainId, newName } = input;

    // Sanitize and validate
    const oldTableName = domainId.replace(/[^a-zA-Z0-9_]/g, "");
    const newTableName = newName.replace(/[^a-zA-Z0-9_]/g, "");

    if (oldTableName !== domainId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Invalid domain ID",
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

      // Check if source table exists
      const tableExists = db
        .query<{ name: string }, [string]>(
          `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
        )
        .get(oldTableName);

      if (!tableExists) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Table not found: ${oldTableName}`,
        });
      }

      // Check if target name already exists
      const targetExists = db
        .query<{ name: string }, [string]>(
          `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
        )
        .get(newTableName);

      if (targetExists) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Table already exists: ${newTableName}`,
        });
      }

      // Rename the table
      executeQuery(db, `ALTER TABLE "${oldTableName}" RENAME TO "${newTableName}"`);

      // Rename associated page if exists
      const pagesDir = join(ctx.workbookDir, "pages");
      const pageRegistry = ctx.getPageRegistry();

      if (pageRegistry) {
        // Try to find page matching old domain name
        const oldPageRoute = `/${oldTableName.replace(/_/g, "-")}`;
        const page = pageRegistry.match(oldPageRoute);

        if (page) {
          // Rename page file
          const oldPath = join(pagesDir, page.path);
          const newSlug = newTableName.replace(/_/g, "-");
          const newPath = join(pagesDir, `${newSlug}${page.ext}`);

          if (existsSync(oldPath) && !existsSync(newPath)) {
            const { renameSync } = await import("node:fs");
            renameSync(oldPath, newPath);
            await pageRegistry.load();
          }
        }
      }

      // Trigger schema regeneration
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
        message: `Failed to rename domain: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }),

  /**
   * Delete a domain (table + associated page)
   *
   * Steps:
   * 1. Drop SQLite table with CASCADE
   * 2. Delete associated page file if exists
   * 3. Trigger schema regeneration
   */
  delete: publicProcedure.input(domainIdInput).mutation(async ({ ctx, input }) => {
    const { domainId } = input;

    // Sanitize table name
    const tableName = domainId.replace(/[^a-zA-Z0-9_]/g, "");
    if (tableName !== domainId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Invalid domain ID",
      });
    }

    try {
      const db = getWorkbookDb(ctx.workbookDir);

      // Check if table exists
      const tableExists = db
        .query<{ name: string }, [string]>(
          `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
        )
        .get(tableName);

      if (!tableExists) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Table not found: ${tableName}`,
        });
      }

      // Get tables that reference this one (for cascade info)
      const referencing = db
        .query<{ name: string }, [string]>(`
        SELECT DISTINCT m.name
        FROM sqlite_master m
        JOIN pragma_foreign_key_list(m.name) fk ON fk."table" = ?
        WHERE m.type = 'table'
      `)
        .all(tableName);

      // Drop the table (SQLite doesn't have CASCADE, but foreign keys will fail if referenced)
      executeQuery(db, `DROP TABLE IF EXISTS "${tableName}"`);

      // Delete associated page if exists
      const pagesDir = join(ctx.workbookDir, "pages");
      const pageRegistry = ctx.getPageRegistry();
      let pageDeleted = false;

      if (pageRegistry) {
        // Try to find page matching domain name
        const pageRoute = `/${tableName.replace(/_/g, "-")}`;
        const page = pageRegistry.match(pageRoute);

        if (page) {
          const pagePath = join(pagesDir, page.path);
          if (existsSync(pagePath)) {
            unlinkSync(pagePath);
            await pageRegistry.load();
            pageDeleted = true;
          }
        }
      }

      // Trigger schema regeneration
      if (ctx.onSchemaChange) {
        await ctx.onSchemaChange();
      }

      return {
        success: true,
        deletedTable: tableName,
        deletedPage: pageDeleted,
        referencingTables: referencing.map((r) => r.name),
      };
    } catch (err) {
      if (err instanceof TRPCError) throw err;
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Failed to delete domain: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }),
});

export type DomainsRouter = typeof domainsRouter;
