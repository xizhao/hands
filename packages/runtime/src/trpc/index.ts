/**
 * tRPC Integration for Hono
 *
 * Sets up tRPC endpoints on the Hono app.
 * Provides type-safe API for desktop client.
 */

import type { PGlite } from "@electric-sql/pglite";
import { initTRPC } from "@trpc/server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import type { Hono } from "hono";
import { actionsRouter } from "../actions/trpc.js";
import { gitRouter } from "../git/trpc.js";
import type { PageRegistry } from "../pages/index.js";
import { sourcesRouter, type TRPCContext } from "../sources/trpc.js";
import { dbRouter, type DbContext } from "./routers/db.js";
import { pagesRouter, type PagesContext } from "./routers/pages.js";
import { secretsRouter, type SecretsContext } from "./routers/secrets.js";
import { statusRouter, type StatusContext } from "./routers/status.js";
import { thumbnailsRouter, type ThumbnailsContext } from "./routers/thumbnails.js";
import { workbookRouter, type WorkbookContext } from "./routers/workbook.js";

export interface TRPCConfig {
  workbookId: string;
  workbookDir: string;
  getDb: () => PGlite | null;
  isDbReady: () => boolean;
  saveDb: () => Promise<void>;
  getState: () => {
    dbReady: boolean;
    viteReady: boolean;
    vitePort: number | null;
    viteError: string | null;
    editorReady: boolean;
    editorPort: number | null;
    editorRestartCount: number;
    buildErrors: string[];
  };
  getManifest: () => Promise<{
    workbookId: string;
    workbookDir: string;
    blocks: Array<{
      id: string;
      title: string;
      path: string;
      parentDir: string;
      uninitialized?: boolean;
    }>;
    sources: Array<{
      id: string;
      name: string;
      title: string;
      description: string;
      schedule?: string;
      secrets: string[];
      missingSecrets: string[];
      path: string;
      spec?: string;
    }>;
    actions: Array<{
      id: string;
      name: string;
      description?: string;
      schedule?: string;
      triggers: string[];
      path: string;
    }>;
    pages: Array<{
      id: string;
      route: string;
      path: string;
      title: string;
    }>;
    config: Record<string, unknown>;
    isEmpty: boolean;
  }>;
  formatBlockSource: (filePath: string) => Promise<boolean>;
  generateDefaultBlockSource: (blockName: string) => string;
  onDdlQuery?: () => Promise<void>;
  // Page registry
  getPageRegistry: () => PageRegistry | null;
  createPageRegistry: (pagesDir: string) => PageRegistry;
}

// Combined context for all routers
interface CombinedContext
  extends TRPCContext,
    StatusContext,
    DbContext,
    SecretsContext,
    WorkbookContext,
    PagesContext,
    ThumbnailsContext {
  saveDb: () => Promise<void>;
}

// Create a merged router that includes all routes
const t = initTRPC.context<CombinedContext>().create();

const appRouter = t.router({
  // Status & health routes
  status: statusRouter,
  // Database routes
  db: dbRouter,
  // Secrets management
  secrets: secretsRouter,
  // Workbook manifest & blocks
  workbook: workbookRouter,
  // Pages routes
  pages: pagesRouter,
  // Thumbnails routes
  thumbnails: thumbnailsRouter,
  // Sources routes (tables, subscriptions, etc.)
  sources: sourcesRouter,
  // Actions routes (list, run, history)
  actions: actionsRouter,
  // Git routes (status, commit, history, push, pull)
  git: gitRouter,
});

export type AppRouter = typeof appRouter;

/**
 * Register tRPC routes on a Hono app
 */
export function registerTRPCRoutes(app: Hono, config: TRPCConfig) {
  const {
    workbookId,
    workbookDir,
    getDb,
    isDbReady,
    saveDb,
    getState,
    getManifest,
    formatBlockSource,
    generateDefaultBlockSource,
    onDdlQuery,
    getPageRegistry,
    createPageRegistry,
  } = config;

  // Handle all /trpc/* requests
  app.all("/trpc/*", async (c) => {
    const _path = c.req.path.replace("/trpc", "");

    // Create combined context for this request
    const ctx: CombinedContext = {
      // Base context
      workbookId,
      workbookDir,
      db: getDb(),
      isDbReady: isDbReady(),
      saveDb,
      // Status context
      getState,
      // Workbook context
      getManifest,
      formatBlockSource,
      generateDefaultBlockSource,
      // DB context
      onDdlQuery,
      // Pages context
      getPageRegistry,
      createPageRegistry,
    };

    // Use tRPC's fetch adapter
    const response = await fetchRequestHandler({
      endpoint: "/trpc",
      req: c.req.raw,
      router: appRouter,
      createContext: () => ctx,
    });

    return response;
  });
}

export type { ActionsRouter } from "../actions/trpc.js";
export type { GitRouter } from "../git/trpc.js";
// Re-export router types for client usage
export type { SourcesRouter } from "../sources/trpc.js";
export type { DbRouter } from "./routers/db.js";
export type { PagesRouter } from "./routers/pages.js";
export type { SecretsRouter } from "./routers/secrets.js";
export type { StatusRouter } from "./routers/status.js";
export type { ThumbnailsRouter } from "./routers/thumbnails.js";
export type { WorkbookRouter } from "./routers/workbook.js";
