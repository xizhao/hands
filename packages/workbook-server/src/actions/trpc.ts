/**
 * tRPC Router for Actions
 *
 * Type-safe API for action management and execution.
 * Queries runtime's /actions endpoint for action metadata.
 */

import { readFile } from "node:fs/promises";
import { initTRPC, TRPCError } from "@trpc/server";
import { z } from "zod";
import type { DiscoveredAction } from "../workbook/types.js";
import { fetchActionsFromRuntime } from "./runtime-client.js";

// ============================================================================
// Context
// ============================================================================

export interface ActionsContext {
  workbookDir: string;
  runtimeUrl: string;
  // Cached discoveries (optional, for performance)
  actions?: DiscoveredAction[];
}

// ============================================================================
// tRPC Setup
// ============================================================================

const t = initTRPC.context<ActionsContext>().create();

const publicProcedure = t.procedure;

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

  /** List all actions */
  list: publicProcedure.query(async ({ ctx }) => {
    const actions = await fetchActionsFromRuntime(ctx.runtimeUrl);
    return actions;
  }),

  /** Get a specific action by ID */
  get: publicProcedure.input(getActionInput).query(async ({ ctx, input }) => {
    const actions = await fetchActionsFromRuntime(ctx.runtimeUrl);
    const action = actions.find((a) => a.id === input.id);

    if (!action) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: `Action not found: ${input.id}`,
      });
    }

    return action;
  }),

  /** Get action source code */
  source: publicProcedure.input(getActionInput).query(async ({ ctx, input }) => {
    const actions = await fetchActionsFromRuntime(ctx.runtimeUrl);
    const action = actions.find((a) => a.id === input.id);

    if (!action) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: `Action not found: ${input.id}`,
      });
    }

    try {
      const fullPath = join(ctx.workbookDir, action.path);
      const source = await readFile(fullPath, "utf-8");
      return { source, path: action.path };
    } catch (err) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Failed to read action source: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }),

  // ==================
  // Action Execution
  // ==================

  /** Run an action manually */
  run: publicProcedure.input(runActionInput).mutation(async ({ ctx, input }) => {
    const actions = await fetchActionsFromRuntime(ctx.runtimeUrl);
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

    // Action execution requires the Vite runtime which has been removed
    // TODO: Implement direct action execution
    throw new TRPCError({
      code: "NOT_IMPLEMENTED",
      message: "Action execution is not yet implemented in the new architecture",
    });
  }),
});

// Export router type for client
export type ActionsRouter = typeof actionsRouter;
