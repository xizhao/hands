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
import { sourcesRouter, type TRPCContext } from "../sources/trpc.js";

export interface TRPCConfig {
  workbookDir: string;
  getDb: () => PGlite | null;
  isDbReady: () => boolean;
}

// Create a merged router that includes both sources and actions
const t = initTRPC.context<TRPCContext>().create();

const appRouter = t.router({
  // Sources routes (tables, subscriptions, etc.)
  sources: sourcesRouter,
  // Actions routes (list, run, history)
  actions: actionsRouter,
});

export type AppRouter = typeof appRouter;

/**
 * Register tRPC routes on a Hono app
 */
export function registerTRPCRoutes(app: Hono, config: TRPCConfig) {
  const { workbookDir, getDb, isDbReady } = config;

  // Handle all /trpc/* requests
  app.all("/trpc/*", async (c) => {
    const _path = c.req.path.replace("/trpc", "");

    // Create context for this request
    const ctx: TRPCContext = {
      workbookDir,
      db: getDb(),
      isDbReady: isDbReady(),
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
