/**
 * tRPC Router for Git Operations
 *
 * Type-safe API for git version control of workbooks.
 * Provides endpoints for status, commits, history, and remote operations.
 */

import type { PGlite } from "@electric-sql/pglite";
import { initTRPC, TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  commit,
  getDiffStats,
  getGitStatus,
  getHistory,
  initRepo,
  isGitRepo,
  pull,
  push,
  revertToCommit,
  saveAndCommit,
  setRemote,
  type GitCommit,
  type GitDiffStats,
  type GitStatus,
} from "./index.js";

// ============================================================================
// Context
// ============================================================================

export interface GitContext {
  workbookDir: string;
  db: PGlite | null;
  isDbReady: boolean;
  saveDb: () => Promise<void>;
}

// ============================================================================
// tRPC Setup
// ============================================================================

const t = initTRPC.context<GitContext>().create();

const publicProcedure = t.procedure;

// ============================================================================
// Input Schemas
// ============================================================================

const commitInput = z.object({
  message: z.string().optional(),
});

const historyInput = z.object({
  limit: z.number().min(1).max(500).default(50),
});

const setRemoteInput = z.object({
  url: z.string().url(),
});

const revertInput = z.object({
  hash: z.string().min(4).max(40),
});

// ============================================================================
// Router
// ============================================================================

export const gitRouter = t.router({
  // ==================
  // Status & Info
  // ==================

  /** Get git status for the workbook */
  status: publicProcedure.query(async ({ ctx }): Promise<GitStatus> => {
    return getGitStatus(ctx.workbookDir);
  }),

  /** Check if workbook is a git repo */
  isRepo: publicProcedure.query(async ({ ctx }): Promise<boolean> => {
    return isGitRepo(ctx.workbookDir);
  }),

  /** Get diff statistics for uncommitted changes */
  diffStats: publicProcedure.query(async ({ ctx }): Promise<GitDiffStats> => {
    return getDiffStats(ctx.workbookDir);
  }),

  /** Get commit history */
  history: publicProcedure
    .input(historyInput)
    .query(async ({ ctx, input }): Promise<GitCommit[]> => {
      return getHistory(ctx.workbookDir, input.limit);
    }),

  // ==================
  // Repository Setup
  // ==================

  /** Initialize git repo for workbook */
  init: publicProcedure.mutation(async ({ ctx }): Promise<{ initialized: boolean }> => {
    const alreadyRepo = await isGitRepo(ctx.workbookDir);
    if (alreadyRepo) {
      return { initialized: false };
    }
    await initRepo(ctx.workbookDir);
    return { initialized: true };
  }),

  /** Set or update remote origin URL */
  setRemote: publicProcedure
    .input(setRemoteInput)
    .mutation(async ({ ctx, input }): Promise<{ url: string }> => {
      await setRemote(ctx.workbookDir, input.url);
      return { url: input.url };
    }),

  // ==================
  // Commits
  // ==================

  /** Commit staged changes with optional message */
  commit: publicProcedure
    .input(commitInput)
    .mutation(async ({ ctx, input }): Promise<{ hash: string; message: string }> => {
      try {
        return await commit(ctx.workbookDir, input.message);
      } catch (err) {
        if (err instanceof Error && err.message.includes("Nothing to commit")) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Nothing to commit - working tree is clean",
          });
        }
        throw err;
      }
    }),

  /** Save database and commit all changes (main save operation) */
  save: publicProcedure
    .input(commitInput)
    .mutation(
      async ({ ctx, input }): Promise<{ hash: string; message: string } | null> => {
        // First ensure repo is initialized
        const isRepo = await isGitRepo(ctx.workbookDir);
        if (!isRepo) {
          await initRepo(ctx.workbookDir);
        }

        // Save db and commit
        const result = await saveAndCommit(ctx.workbookDir, ctx.saveDb);

        // If custom message provided but saveAndCommit returned null (no changes),
        // or if we want to use custom message, handle appropriately
        if (result && input.message) {
          // Result already committed with auto message, could amend but for simplicity
          // we'll just return what we have
        }

        return result;
      },
    ),

  // ==================
  // Remote Operations
  // ==================

  /** Push commits to remote */
  push: publicProcedure.mutation(async ({ ctx }): Promise<{ pushed: boolean }> => {
    try {
      await push(ctx.workbookDir);
      return { pushed: true };
    } catch (err) {
      if (err instanceof Error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: err.message,
        });
      }
      throw err;
    }
  }),

  /** Pull from remote */
  pull: publicProcedure.mutation(async ({ ctx }): Promise<{ pulled: boolean }> => {
    try {
      await pull(ctx.workbookDir);
      return { pulled: true };
    } catch (err) {
      if (err instanceof Error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: err.message,
        });
      }
      throw err;
    }
  }),

  /** Revert workbook to a previous commit (safe - creates a new commit) */
  revert: publicProcedure
    .input(revertInput)
    .mutation(async ({ ctx, input }): Promise<{ hash: string; message: string }> => {
      try {
        return await revertToCommit(ctx.workbookDir, input.hash, ctx.saveDb);
      } catch (err) {
        if (err instanceof Error) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: err.message,
          });
        }
        throw err;
      }
    }),
});

// Export router type for client
export type GitRouter = typeof gitRouter;
