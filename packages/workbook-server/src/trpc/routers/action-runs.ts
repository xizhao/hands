/**
 * Action Runs tRPC Router
 *
 * Type-safe API for action run history and logs.
 * Persists to .hands/editor.db SQLite database.
 */

import { initTRPC } from "@trpc/server";
import { z } from "zod";
import {
  type ActionRunLog,
  type ActionRunRecord,
  getActionRun,
  getActionRunLogs,
  getActionRuns,
  getEditorDb,
} from "../../db/editor-db.js";

// ============================================================================
// Context
// ============================================================================

export interface ActionRunsContext {
  workbookDir: string;
}

// ============================================================================
// tRPC Setup
// ============================================================================

const t = initTRPC.context<ActionRunsContext>().create();
const publicProcedure = t.procedure;

// ============================================================================
// Input Schemas
// ============================================================================

const listRunsInput = z.object({
  actionId: z.string(),
  limit: z.number().optional(),
});

const getRunInput = z.object({
  runId: z.string(),
});

const getLogsInput = z.object({
  runId: z.string(),
});

// ============================================================================
// Router
// ============================================================================

export const actionRunsRouter = t.router({
  /**
   * List runs for an action
   */
  list: publicProcedure.input(listRunsInput).query(({ ctx, input }): ActionRunRecord[] => {
    const db = getEditorDb(ctx.workbookDir);
    return getActionRuns(db, input.actionId, input.limit ?? 20);
  }),

  /**
   * Get a specific run by ID
   */
  get: publicProcedure.input(getRunInput).query(({ ctx, input }): ActionRunRecord | null => {
    const db = getEditorDb(ctx.workbookDir);
    return getActionRun(db, input.runId);
  }),

  /**
   * Get logs for a run
   */
  getLogs: publicProcedure.input(getLogsInput).query(({ ctx, input }): ActionRunLog[] => {
    const db = getEditorDb(ctx.workbookDir);
    return getActionRunLogs(db, input.runId);
  }),
});

export type ActionRunsRouter = typeof actionRunsRouter;
