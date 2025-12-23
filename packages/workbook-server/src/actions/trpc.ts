/**
 * tRPC Router for Actions
 *
 * Type-safe API for action management and execution.
 * Actions are discovered from the workbook discovery module and executed via HTTP to runtime.
 */

import { initTRPC, TRPCError } from "@trpc/server";
import { z } from "zod";
import { discoverActions } from "../workbook/discovery.js";
import type { DiscoveredAction } from "../workbook/types.js";
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

import { join } from "node:path";

export const actionsRouter = t.router({
  // ==================
  // Action Discovery
  // ==================

  /** List all discovered actions */
  list: publicProcedure.query(async ({ ctx }) => {
    const actionsDir = join(ctx.workbookDir, "actions");
    const result = await discoverActions(actionsDir, ctx.workbookDir);
    return result.items;
  }),

  /** Get a specific action by ID */
  get: publicProcedure.input(getActionInput).query(async ({ ctx, input }) => {
    const actionsDir = join(ctx.workbookDir, "actions");
    const result = await discoverActions(actionsDir, ctx.workbookDir);
    const action = result.items.find((a) => a.id === input.id);

    if (!action) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: `Action not found: ${input.id}`,
      });
    }

    return action;
  }),

  // ==================
  // Action Execution
  // ==================

  /** Run an action manually */
  run: runtimeProcedure.input(runActionInput).mutation(async ({ ctx, input }) => {
    // Discover action
    const actionsDir = join(ctx.workbookDir, "actions");
    const result = await discoverActions(actionsDir, ctx.workbookDir);
    const action = result.items.find((a) => a.id === input.id);

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
