/**
 * tRPC Router for Actions
 *
 * Type-safe API for action management and execution.
 * Provides endpoints for listing, running, and viewing action history.
 */

import type { PGlite } from "@electric-sql/pglite";
import type { DiscoveredAction } from "@hands/stdlib";
import { initTRPC, TRPCError } from "@trpc/server";
import { z } from "zod";
import { discoverSources } from "../sources/discovery.js";
import type { DiscoveredSource } from "../sources/types.js";
import { discoverActions } from "./discovery.js";
import { executeAction } from "./executor.js";
import {
  getActionRun,
  getActionRunStats,
  getLastActionRun,
  initActionRunsTable,
  queryActionRuns,
} from "./history.js";

// ============================================================================
// Context
// ============================================================================

export interface ActionsContext {
  workbookDir: string;
  db: PGlite | null;
  isDbReady: boolean;
  // Cached discoveries (optional, for performance)
  actions?: DiscoveredAction[];
  sources?: DiscoveredSource[];
}

// ============================================================================
// tRPC Setup
// ============================================================================

const t = initTRPC.context<ActionsContext>().create();

const publicProcedure = t.procedure;

// Middleware to ensure DB is ready
const dbProcedure = publicProcedure.use(async ({ ctx, next }) => {
  if (!ctx.isDbReady || !ctx.db) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Database not ready",
    });
  }
  return next({
    ctx: {
      ...ctx,
      db: ctx.db,
    },
  });
});

// ============================================================================
// Input Schemas
// ============================================================================

const runActionInput = z.object({
  id: z.string(),
  input: z.unknown().optional(),
});

const queryRunsInput = z.object({
  actionId: z.string().optional(),
  status: z.enum(["running", "success", "failed"]).optional(),
  limit: z.number().min(1).max(1000).default(50),
  offset: z.number().min(0).default(0),
});

const getRunInput = z.object({
  runId: z.string(),
});

const getActionInput = z.object({
  id: z.string(),
});

const getStatsInput = z.object({
  actionId: z.string(),
});

// ============================================================================
// Router
// ============================================================================

export const actionsRouter = t.router({
  // ==================
  // Action Discovery
  // ==================

  /** List all discovered actions */
  list: dbProcedure.query(async ({ ctx }) => {
    const actions = await discoverActions(ctx.workbookDir);

    // Enrich with last run info
    const enrichedActions = await Promise.all(
      actions.map(async (action) => {
        const lastRun = await getLastActionRun(ctx.db, action.id);
        return {
          id: action.id,
          name: action.definition.name,
          description: action.definition.description,
          path: action.path,
          schedule: action.definition.schedule,
          triggers: action.definition.triggers ?? ["manual"],
          hasWebhook: action.definition.triggers?.includes("webhook") ?? false,
          webhookPath: action.definition.webhookPath,
          secrets: action.definition.secrets,
          missingSecrets: action.missingSecrets,
          hasInput: !!action.definition.input,
          nextRun: action.nextRun,
          lastRun: lastRun
            ? {
                id: lastRun.id,
                status: lastRun.status,
                startedAt: lastRun.startedAt,
                durationMs: lastRun.durationMs,
              }
            : null,
        };
      }),
    );

    return enrichedActions;
  }),

  /** Get a specific action by ID */
  get: dbProcedure.input(getActionInput).query(async ({ ctx, input }) => {
    const actions = await discoverActions(ctx.workbookDir);
    const action = actions.find((a) => a.id === input.id);

    if (!action) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: `Action not found: ${input.id}`,
      });
    }

    // Get last run and stats
    const [lastRun, stats] = await Promise.all([
      getLastActionRun(ctx.db, action.id),
      getActionRunStats(ctx.db, action.id),
    ]);

    return {
      id: action.id,
      name: action.definition.name,
      description: action.definition.description,
      path: action.path,
      schedule: action.definition.schedule,
      triggers: action.definition.triggers ?? ["manual"],
      hasWebhook: action.definition.triggers?.includes("webhook") ?? false,
      webhookPath: action.definition.webhookPath,
      pgNotifyChannel: action.definition.pgNotifyChannel,
      secrets: action.definition.secrets,
      missingSecrets: action.missingSecrets,
      hasInput: !!action.definition.input,
      // Input schema description (if available)
      inputSchema: action.definition.input
        ? {
            // Zod doesn't expose schema directly, but we can get description
            description: action.definition.input.description,
          }
        : null,
      nextRun: action.nextRun,
      lastRun,
      stats,
    };
  }),

  // ==================
  // Action Execution
  // ==================

  /** Run an action manually */
  run: dbProcedure.input(runActionInput).mutation(async ({ ctx, input }) => {
    // Discover action
    const actions = await discoverActions(ctx.workbookDir);
    const action = actions.find((a) => a.id === input.id);

    if (!action) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: `Action not found: ${input.id}`,
      });
    }

    // Check for missing secrets
    if (action.missingSecrets?.length) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: `Missing required secrets: ${action.missingSecrets.join(", ")}`,
      });
    }

    // Discover sources for context
    const sources = await discoverSources(ctx.workbookDir, ctx.db);

    // Execute the action
    const run = await executeAction({
      action,
      trigger: "manual",
      input: input.input,
      db: ctx.db,
      sources,
      workbookDir: ctx.workbookDir,
    });

    return run;
  }),

  // ==================
  // Run History
  // ==================

  /** Query action runs */
  runs: dbProcedure.input(queryRunsInput).query(async ({ ctx, input }) => {
    const runs = await queryActionRuns(ctx.db, {
      actionId: input.actionId,
      status: input.status,
      limit: input.limit,
      offset: input.offset,
    });

    return runs;
  }),

  /** Get a specific run by ID */
  getRun: dbProcedure.input(getRunInput).query(async ({ ctx, input }) => {
    const run = await getActionRun(ctx.db, input.runId);

    if (!run) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: `Run not found: ${input.runId}`,
      });
    }

    return run;
  }),

  /** Get run statistics for an action */
  stats: dbProcedure.input(getStatsInput).query(async ({ ctx, input }) => {
    const stats = await getActionRunStats(ctx.db, input.actionId);
    return stats;
  }),

  // ==================
  // Management
  // ==================

  /** Initialize the actions system (creates tables) */
  init: dbProcedure.mutation(async ({ ctx }) => {
    await initActionRunsTable(ctx.db);
    return { initialized: true };
  }),
});

// Export router type for client
export type ActionsRouter = typeof actionsRouter;
