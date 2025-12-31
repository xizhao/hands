/**
 * tRPC Router for Page Operations
 *
 * Type-safe API for page CRUD operations.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { initTRPC, TRPCError } from "@trpc/server";
import { z } from "zod";
import type { PageRegistry } from "../../pages/index.js";

// ============================================================================
// Context
// ============================================================================

export interface PagesContext {
  workbookDir: string;
  getPageRegistry: () => PageRegistry | null;
  createPageRegistry: (pagesDir: string) => PageRegistry;
}

// ============================================================================
// tRPC Setup
// ============================================================================

const t = initTRPC.context<PagesContext>().create();

const registryReadyProcedure = t.procedure.use(async ({ ctx, next }) => {
  const registry = ctx.getPageRegistry();
  if (!registry) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Page registry not initialized",
    });
  }
  return next({ ctx: { ...ctx, pageRegistry: registry } });
});

// ============================================================================
// Input Schemas
// ============================================================================

const pageRouteInput = z.object({
  route: z.string().min(1),
});

const saveSourceInput = z.object({
  route: z.string().min(1),
  source: z.string(),
});

const renameInput = z.object({
  route: z.string().min(1),
  newSlug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9][a-z0-9-]*$/, {
      message: "Invalid slug - use lowercase, numbers, hyphens only",
    }),
});

const createPageInput = z.object({
  pageId: z
    .string()
    .min(1)
    .regex(/^[a-z0-9][a-z0-9-]*$/, {
      message: "Invalid pageId - use lowercase, numbers, hyphens only",
    })
    .optional(),
});

// ============================================================================
// Router
// ============================================================================

export const pagesRouter = t.router({
  /** List all pages (excluding blocks/) */
  list: registryReadyProcedure.query(({ ctx }) => {
    const allPages = ctx.pageRegistry.list();
    const pages = allPages.filter((p) => !p.isBlock);
    return {
      pages,
      routes: pages.map((p) => p.route),
      errors: ctx.pageRegistry.getErrors(),
    };
  }),

  /** List all blocks (from blocks/ subdirectory) */
  listBlocks: registryReadyProcedure.query(({ ctx }) => {
    const allPages = ctx.pageRegistry.list();
    const blocks = allPages.filter((p) => p.isBlock);
    return {
      blocks,
      errors: ctx.pageRegistry.getErrors(),
    };
  }),

  /** List everything (pages + blocks) */
  listAll: registryReadyProcedure.query(({ ctx }) => {
    return {
      pages: ctx.pageRegistry.list(),
      routes: ctx.pageRegistry.routes(),
      errors: ctx.pageRegistry.getErrors(),
    };
  }),

  /** Get page source code */
  getSource: registryReadyProcedure.input(pageRouteInput).query(async ({ ctx, input }) => {
    const route = input.route.startsWith("/") ? input.route : `/${input.route}`;
    const page = ctx.pageRegistry.match(route);

    if (!page) {
      throw new TRPCError({ code: "NOT_FOUND", message: `Page not found: ${route}` });
    }

    const source = await ctx.pageRegistry.getSource(page.route);
    if (!source) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to read page source" });
    }

    return {
      route: page.route,
      path: page.path,
      source,
    };
  }),

  /** Save page source code */
  saveSource: registryReadyProcedure.input(saveSourceInput).mutation(async ({ ctx, input }) => {
    const route = input.route.startsWith("/") ? input.route : `/${input.route}`;
    const page = ctx.pageRegistry.match(route);

    if (!page) {
      throw new TRPCError({ code: "NOT_FOUND", message: `Page not found: ${route}` });
    }

    const pagesDir = ctx.pageRegistry.getPagesDir();
    const filePath = join(pagesDir, page.path);

    try {
      const { openSync, writeSync, fsyncSync, closeSync } = await import("node:fs");
      const fd = openSync(filePath, "w");
      writeSync(fd, input.source, 0, "utf-8");
      fsyncSync(fd);
      closeSync(fd);

      // Invalidate cached compilation
      ctx.pageRegistry.invalidate(page.route);

      return {
        route: page.route,
        path: page.path,
      };
    } catch (err) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Failed to write page: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }),

  /** Create a new page */
  create: t.procedure.input(createPageInput).mutation(async ({ ctx, input }) => {
    const pagesDir = join(ctx.workbookDir, "pages");

    // Create pages directory if it doesn't exist
    if (!existsSync(pagesDir)) {
      const { mkdirSync } = await import("node:fs");
      mkdirSync(pagesDir, { recursive: true });
    }

    // Use provided pageId or generate "untitled" name
    let pageId: string;
    if (input.pageId) {
      pageId = input.pageId;
      // Check if page already exists
      const targetPath = join(pagesDir, `${pageId}.mdx`);
      if (existsSync(targetPath)) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Page already exists: ${pageId}`,
        });
      }
      // Create parent directory if it doesn't exist (e.g., for blocks/untitled)
      const parentDir = join(pagesDir, pageId.split("/").slice(0, -1).join("/"));
      if (parentDir !== pagesDir && !existsSync(parentDir)) {
        const { mkdirSync } = await import("node:fs");
        mkdirSync(parentDir, { recursive: true });
      }
    } else {
      // Find next available "untitled" name
      pageId = "untitled";
      let counter = 0;
      while (existsSync(join(pagesDir, `${pageId}.mdx`))) {
        counter++;
        pageId = `untitled-${counter}`;
      }
    }

    const filePath = join(pagesDir, `${pageId}.mdx`);

    // Convert slug to title case (e.g., "my-page" -> "My Page", "blocks/header" -> "Header")
    const baseName = pageId.split("/").pop() || pageId;
    const title = baseName
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");

    const defaultSource = `---
title: "${title}"
---

`;

    try {
      const { openSync, writeSync, fsyncSync, closeSync } = await import("node:fs");
      const fd = openSync(filePath, "w");
      writeSync(fd, defaultSource, 0, "utf-8");
      fsyncSync(fd);
      closeSync(fd);

      // Reload page registry to pick up the new page
      let registry = ctx.getPageRegistry();
      if (registry) {
        await registry.load();
      } else {
        // Initialize page registry if it doesn't exist
        registry = ctx.createPageRegistry(pagesDir);
        await registry.load();
      }

      return {
        pageId,
        filePath,
      };
    } catch (err) {
      if (err instanceof TRPCError) throw err;
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Failed to create page: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }),

  /** Delete a page */
  delete: registryReadyProcedure.input(pageRouteInput).mutation(async ({ ctx, input }) => {
    const route = input.route.startsWith("/") ? input.route : `/${input.route}`;
    const page = ctx.pageRegistry.match(route);

    if (!page) {
      throw new TRPCError({ code: "NOT_FOUND", message: `Page not found: ${route}` });
    }

    const pagesDir = ctx.pageRegistry.getPagesDir();
    const filePath = join(pagesDir, page.path);

    try {
      const { unlinkSync } = await import("node:fs");
      unlinkSync(filePath);

      // Reload page registry
      await ctx.pageRegistry.load();

      return {
        deletedRoute: route,
        deletedPath: page.path,
      };
    } catch (err) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Failed to delete: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }),

  /** Rename a page */
  rename: registryReadyProcedure.input(renameInput).mutation(async ({ ctx, input }) => {
    const route = input.route.startsWith("/") ? input.route : `/${input.route}`;
    const page = ctx.pageRegistry.match(route);

    if (!page) {
      throw new TRPCError({ code: "NOT_FOUND", message: `Page not found: ${route}` });
    }

    const pagesDir = ctx.pageRegistry.getPagesDir();
    const oldFilePath = join(pagesDir, page.path);
    const newFileName = `${input.newSlug}${page.ext}`;
    const newFilePath = join(pagesDir, newFileName);

    // Check if target already exists (and isn't the same file)
    if (oldFilePath !== newFilePath && existsSync(newFilePath)) {
      throw new TRPCError({ code: "CONFLICT", message: `Page already exists: ${input.newSlug}` });
    }

    // Skip if same file
    if (oldFilePath === newFilePath) {
      return { newRoute: route, noChange: true };
    }

    try {
      const { renameSync } = await import("node:fs");
      renameSync(oldFilePath, newFilePath);

      // Reload page registry
      await ctx.pageRegistry.load();

      // Calculate new route
      const newRoute = input.newSlug === "index" ? "/" : `/${input.newSlug}`;

      return {
        oldRoute: route,
        newRoute,
        newPath: newFileName,
      };
    } catch (err) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Failed to rename: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }),

  /** Duplicate a page */
  duplicate: registryReadyProcedure.input(pageRouteInput).mutation(async ({ ctx, input }) => {
    const route = input.route.startsWith("/") ? input.route : `/${input.route}`;
    const page = ctx.pageRegistry.match(route);

    if (!page) {
      throw new TRPCError({ code: "NOT_FOUND", message: `Page not found: ${route}` });
    }

    const pagesDir = ctx.pageRegistry.getPagesDir();

    // Read original source
    const source = await ctx.pageRegistry.getSource(page.route);
    if (!source) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to read page source" });
    }

    // Generate unique name: original-copy, original-copy-1, etc.
    const baseName = page.path.replace(page.ext, "");
    let newName = `${baseName}-copy`;
    let counter = 0;
    while (existsSync(join(pagesDir, `${newName}${page.ext}`))) {
      counter++;
      newName = `${baseName}-copy-${counter}`;
    }

    const newPath = `${newName}${page.ext}`;
    const newFilePath = join(pagesDir, newPath);

    try {
      const { writeFileSync } = await import("node:fs");
      writeFileSync(newFilePath, source, "utf-8");

      // Reload page registry
      await ctx.pageRegistry.load();

      const newRoute = newName === "index" ? "/" : `/${newName}`;

      return {
        originalRoute: route,
        newRoute,
        newPath,
      };
    } catch (err) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Failed to duplicate: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }),

  /** Reload page registry */
  reload: registryReadyProcedure.mutation(async ({ ctx }) => {
    try {
      const result = await ctx.pageRegistry.load();
      return {
        pages: result.pages.length,
        errors: result.errors,
      };
    } catch (err) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Failed to reload: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }),
});

export type PagesRouter = typeof pagesRouter;
