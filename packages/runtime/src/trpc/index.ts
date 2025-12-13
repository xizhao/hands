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
import { sourcesRouter, type TRPCContext } from "../sources/trpc.js";

export interface TRPCConfig {
  workbookDir: string;
  getDb: () => PGlite | null;
  isDbReady: () => boolean;
  saveDb: () => Promise<void>;
}

// Extended context that includes saveDb for git operations
interface ExtendedContext extends TRPCContext {
  saveDb: () => Promise<void>;
}

// Create a merged router that includes sources, actions, and git
const t = initTRPC.context<ExtendedContext>().create();

const appRouter = t.router({
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
  const { workbookDir, getDb, isDbReady, saveDb } = config;

  // Handle all /trpc/* requests
  app.all("/trpc/*", async (c) => {
    const _path = c.req.path.replace("/trpc", "");

    // Create context for this request
    const ctx: ExtendedContext = {
      workbookDir,
      db: getDb(),
      isDbReady: isDbReady(),
      saveDb,
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

// Re-export router types for client usage
export type { SourcesRouter } from "../sources/trpc.js";
export type { ActionsRouter } from "../actions/trpc.js";
export type { GitRouter } from "../git/trpc.js";
