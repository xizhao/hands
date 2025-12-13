/**
 * tRPC Integration for Hono
 *
 * Sets up tRPC endpoints on the Hono app.
 * Provides type-safe API for desktop client.
 */

import type { PGlite } from "@electric-sql/pglite";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import type { Hono } from "hono";
import { sourcesRouter, type TRPCContext } from "../sources/trpc.js";

export interface TRPCConfig {
  workbookDir: string;
  getDb: () => PGlite | null;
  isDbReady: () => boolean;
}

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
      router: sourcesRouter,
      createContext: () => ctx,
    });

    return response;
  });
}

// Re-export router type for client usage
export type { SourcesRouter } from "../sources/trpc.js";
