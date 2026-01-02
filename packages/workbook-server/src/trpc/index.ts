/**
 * tRPC Integration for Hono
 *
 * Sets up tRPC endpoints on the Hono app.
 * Provides type-safe API for desktop client.
 */

import { initTRPC } from "@trpc/server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import type { Hono } from "hono";
import { type ActionsContext, actionsRouter } from "../actions/trpc.js";
import { gitRouter } from "../git/trpc.js";
import type { PageRegistry } from "../pages/index.js";
import { type SQLiteTRPCContext, sqliteTRPCRouter } from "../sqlite/trpc.js";
import { type ActionRunsContext, actionRunsRouter } from "./routers/action-runs.js";
import { type AIContext, aiRouter } from "./routers/ai.js";
import { type DeployContext, deployRouter } from "./routers/deploy.js";
import { type DomainsContext, domainsRouter } from "./routers/domains.js";
import { type ViewerDeployContext, viewerDeployRouter } from "./routers/viewer-deploy.js";
import { type EditorStateContext, editorStateRouter } from "./routers/editor-state.js";
import { type PagesContext, pagesRouter } from "./routers/pages.js";
import { type SecretsContext, secretsRouter } from "./routers/secrets.js";
import { type StatusContext, statusRouter } from "./routers/status.js";
import { type ThumbnailsContext, thumbnailsRouter } from "./routers/thumbnails.js";
import { type WorkbookContext, workbookRouter } from "./routers/workbook.js";

export interface TRPCConfig {
  workbookId: string;
  workbookDir: string;
  /** Runtime URL for RSC rendering (e.g., http://localhost:55200) */
  getRuntimeUrl: () => string | null;
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
    ActionsContext,
    EditorStateContext,
    ActionRunsContext,
    DeployContext,
    DomainsContext,
    ViewerDeployContext {}

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
  // Domain CRUD (tables as first-class entities)
  domains: domainsRouter,
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
  // Editor state routes (ui state, sidebar, recents)
  editorState: editorStateRouter,
  // Action run history and logs
  actionRuns: actionRunsRouter,
  // Deploy routes (build and publish to CF Workers)
  deploy: deployRouter,
  // Viewer deploy routes (publish to shared viewer - no build needed)
  viewerDeploy: viewerDeployRouter,
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

    // Get runtime URL for actions (actions still execute in runtime)
    const runtimeUrl = getRuntimeUrl();

    // Create combined context for this request
    const ctx: CombinedContext = {
      // Base context
      workbookId,
      workbookDir,
      // D1 database context - uses wrangler's getPlatformProxy
      onSchemaChange,
      // Actions context - still needs runtime for action execution
      runtimeUrl: runtimeUrl ?? "http://localhost:55200",
      // Status context
      getState,
      // Workbook context
      getExternalConfig,
      formatBlockSource,
      generateDefaultBlockSource,
      // Pages context
      getPageRegistry,
      createPageRegistry,
      // Deploy context
      getRuntimeUrl,
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
// Re-export model types for client usage
export type {
  ActionRunLog,
  ActionRunRecord,
  RecentItem,
  StepRecord,
  UiState,
} from "../db/editor-db.js";
export type { GitRouter } from "../git/trpc.js";
// Re-export router types for client usage
export type { SQLiteTRPCRouter as DbRouter } from "../sqlite/trpc.js";
export type { ActionRunsRouter } from "./routers/action-runs.js";
export type { AIRouter } from "./routers/ai.js";
export type { DeployRouter } from "./routers/deploy.js";
export type { DomainsRouter } from "./routers/domains.js";
export type { ViewerDeployRouter } from "./routers/viewer-deploy.js";
export type { EditorStateRouter } from "./routers/editor-state.js";
export type { PagesRouter } from "./routers/pages.js";
export type { SecretsRouter } from "./routers/secrets.js";
export type { StatusRouter } from "./routers/status.js";
export type { ThumbnailsRouter } from "./routers/thumbnails.js";
export type { WorkbookRouter } from "./routers/workbook.js";
