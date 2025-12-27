/**
 * tRPC Router for Runtime Status
 *
 * Provides type-safe endpoints for runtime health, status, and diagnostics.
 */

import { initTRPC } from "@trpc/server";

// ============================================================================
// Context
// ============================================================================

export interface StatusContext {
  workbookId: string;
  workbookDir: string;
  getState: () => {
    buildErrors: string[];
  };
}

// ============================================================================
// tRPC Setup
// ============================================================================

const t = initTRPC.context<StatusContext>().create();

const publicProcedure = t.procedure;

// ============================================================================
// Router
// ============================================================================

export const statusRouter = t.router({
  /** Basic health check */
  health: publicProcedure.query(() => {
    return {
      ready: true,
      status: "ready" as const,
    };
  }),

  /** Detailed service status */
  get: publicProcedure.query(({ ctx }) => {
    const state = ctx.getState();
    return {
      workbookId: ctx.workbookId,
      workbookDir: ctx.workbookDir,
      services: {
        database: {
          ready: true,
        },
      },
      buildErrors: state.buildErrors,
    };
  }),

  /** Eval diagnostics for AlertsPanel */
  eval: publicProcedure.query(() => {
    return {
      timestamp: Date.now(),
      duration: 0,
      wrangler: null,
      typescript: { errors: [] as string[], warnings: [] as string[] },
      format: { fixed: [] as string[], errors: [] as string[] },
      unused: { exports: [] as string[], files: [] as string[] },
      services: {
        database: {
          up: true,
        },
      },
    };
  }),
});

export type StatusRouter = typeof statusRouter;
