/**
 * tRPC Integration for Hono
 *
 * Sets up tRPC endpoints on the Hono app.
 * Provides type-safe API for desktop client.
 */

import { initTRPC } from "@trpc/server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import type { Hono } from "hono";
import { actionsRouter, type ActionsContext } from "../actions/trpc.js";
import { gitRouter } from "../git/trpc.js";
import type { PageRegistry } from "../pages/index.js";
import { sqliteTRPCRouter, type SQLiteTRPCContext } from "../sqlite/trpc.js";
import { aiRouter, type AIContext } from "./routers/ai.js";
import { pagesRouter, type PagesContext } from "./routers/pages.js";
import { secretsRouter, type SecretsContext } from "./routers/secrets.js";
import { statusRouter, type StatusContext } from "./routers/status.js";
import { thumbnailsRouter, type ThumbnailsContext } from "./routers/thumbnails.js";
import { workbookRouter, type WorkbookContext } from "./routers/workbook.js";

export interface TRPCConfig {
  workbookId: string;
  workbookDir: string;
  /** Runtime URL for SQLite database access (e.g., http://localhost:55200) */
  getRuntimeUrl: () => string | null;
  /** Whether the runtime/database is ready */
  isDbReady: () => boolean;
  getState: () => {
    rscReady: boolean;
    rscPort: number | null;
    rscError: string | null;
    buildErrors: string[];
  };
  /** Optional: provides config from package.json */
  getExternalConfig?: () => Promise<Record<string, unknown>>;
  formatBlockSource: (filePath: string) => Promise<boolean>;
  generateDefaultBlockSource: (blockName: string) => string;
  /** Called when schema changes (DDL executed) */
  onSchemaChange?: () => Promise<void>;
  // Page registry
  getPageRegistry: () => PageRegistry | null;
  createPageRegistry: (pagesDir: string) => PageRegistry;
}

// Combined context for all routers
interface CombinedContext
  extends StatusContext,
    SQLiteTRPCContext,
    SecretsContext,
    WorkbookContext,
    PagesContext,
    ThumbnailsContext,
    AIContext,
    ActionsContext {}

// Create a merged router that includes all routes
const t = initTRPC.context<CombinedContext>().create();

const appRouter = t.router({
  // Status & health routes
  status: statusRouter,
  // Database routes (SQLite via runtime)
  db: sqliteTRPCRouter,
  // Secrets management
  secrets: secretsRouter,
  // Workbook manifest & blocks
  workbook: workbookRouter,
  // Pages routes
  pages: pagesRouter,
  // Thumbnails routes
  thumbnails: thumbnailsRouter,
  // Actions routes (list, run, history)
  actions: actionsRouter,
  // Git routes (status, commit, history, push, pull)
  git: gitRouter,
  // AI routes (text-to-sql, copilot)
  ai: aiRouter,
});

export type AppRouter = typeof appRouter;

/**
 * Register tRPC routes on a Hono app
 */
export function registerTRPCRoutes(app: Hono, config: TRPCConfig) {
  const {
    workbookId,
    workbookDir,
    getRuntimeUrl,
    isDbReady,
    getState,
    getExternalConfig,
    formatBlockSource,
    generateDefaultBlockSource,
    onSchemaChange,
    getPageRegistry,
    createPageRegistry,
  } = config;

  // Handle all /trpc/* requests
  app.all("/trpc/*", async (c) => {
    const _path = c.req.path.replace("/trpc", "");

    // Get runtime URL for SQLite access
    const runtimeUrl = getRuntimeUrl();

    // Create combined context for this request
    const ctx: CombinedContext = {
      // Base context
      workbookId,
      workbookDir,
      isDbReady: isDbReady(),
      // SQLite context - runtime URL for database access
      runtimeUrl: runtimeUrl ?? "http://localhost:55200",
      onSchemaChange,
      // Status context
      getState,
      // Workbook context
      getExternalConfig,
      formatBlockSource,
      generateDefaultBlockSource,
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
export type { SQLiteTRPCRouter as DbRouter } from "../sqlite/trpc.js";
export type { AIRouter } from "./routers/ai.js";
export type { PagesRouter } from "./routers/pages.js";
export type { SecretsRouter } from "./routers/secrets.js";
export type { StatusRouter } from "./routers/status.js";
export type { ThumbnailsRouter } from "./routers/thumbnails.js";
export type { WorkbookRouter } from "./routers/workbook.js";
