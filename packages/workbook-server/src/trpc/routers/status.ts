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
    rscReady: boolean;
    rscPort: number | null;
    rscError: string | null;
    editorReady: boolean;
    editorPort: number | null;
    editorRestartCount: number;
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
  health: publicProcedure.query(({ ctx }) => {
    const state = ctx.getState();
    return {
      ready: state.rscReady,
      status: state.rscReady ? ("ready" as const) : ("booting" as const),
    };
  }),

  /** Detailed service status */
  get: publicProcedure.query(({ ctx }) => {
    const state = ctx.getState();
    return {
      workbookId: ctx.workbookId,
      workbookDir: ctx.workbookDir,
      services: {
        runtime: {
          ready: state.rscReady,
          port: state.rscPort,
          error: state.rscError,
        },
        editor: {
          ready: state.editorReady,
          port: state.editorPort,
          restartCount: state.editorRestartCount,
        },
      },
      buildErrors: state.buildErrors,
    };
  }),

  /** Eval diagnostics for AlertsPanel */
  eval: publicProcedure.query(({ ctx }) => {
    const state = ctx.getState();
    return {
      timestamp: Date.now(),
      duration: 0,
      wrangler: null,
      typescript: { errors: [] as string[], warnings: [] as string[] },
      format: { fixed: [] as string[], errors: [] as string[] },
      unused: { exports: [] as string[], files: [] as string[] },
      services: {
        runtime: {
          up: state.rscReady,
          port: state.rscPort ?? 0,
          error: state.rscReady ? undefined : state.rscError || "Runtime is starting",
        },
      },
    };
  }),
});

export type StatusRouter = typeof statusRouter;
