/**
 * tRPC Router for Actions
 *
 * Type-safe API for action management and execution.
 * Actions are discovered from the actions/ directory and executed via HTTP to runtime.
 */

import type { DiscoveredAction } from "@hands/core/primitives";
import { initTRPC, TRPCError } from "@trpc/server";
import { z } from "zod";
import { discoverActions } from "./discovery.js";
import { executeActionHttp } from "./executor-http.js";

// ============================================================================
// Context
// ============================================================================

export interface ActionsContext {
  workbookDir: string;
  /** Runtime URL for action execution (e.g., http://localhost:55200) */
  runtimeUrl: string;
  isDbReady: boolean;
  // Cached discoveries (optional, for performance)
  actions?: DiscoveredAction[];
}

// ============================================================================
// tRPC Setup
// ============================================================================

const t = initTRPC.context<ActionsContext>().create();

const publicProcedure = t.procedure;

// Middleware to ensure runtime is ready for execution
const runtimeProcedure = publicProcedure.use(async ({ ctx, next }) => {
  if (!ctx.isDbReady) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Runtime not ready",
    });
  }
  return next({ ctx });
});

// ============================================================================
// Input Schemas
// ============================================================================

const runActionInput = z.object({
  id: z.string(),
  input: z.unknown().optional(),
});

const getActionInput = z.object({
  id: z.string(),
});

// ============================================================================
// Router
// ============================================================================

export const actionsRouter = t.router({
  // ==================
  // Action Discovery
  // ==================

  /** List all discovered actions */
  list: publicProcedure.query(async ({ ctx }) => {
    const actions = await discoverActions(ctx.workbookDir);

    return actions.map((action) => ({
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
      hasSchema: !!action.definition.schema,
      nextRun: action.nextRun,
    }));
  }),

  /** Get a specific action by ID */
  get: publicProcedure.input(getActionInput).query(async ({ ctx, input }) => {
    const actions = await discoverActions(ctx.workbookDir);
    const action = actions.find((a) => a.id === input.id);

    if (!action) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: `Action not found: ${input.id}`,
      });
    }

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
      inputSchema: action.definition.input
        ? { description: action.definition.input.description }
        : null,
      schema: action.definition.schema ?? null,
      nextRun: action.nextRun,
    };
  }),

  // ==================
  // Action Execution
  // ==================

  /** Run an action manually */
  run: runtimeProcedure.input(runActionInput).mutation(async ({ ctx, input }) => {
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

    // Execute the action via runtime
    const run = await executeActionHttp({
      action,
      trigger: "manual",
      input: input.input,
      runtimeUrl: ctx.runtimeUrl,
      workbookDir: ctx.workbookDir,
    });

    return run;
  }),
});

// Export router type for client
export type ActionsRouter = typeof actionsRouter;
