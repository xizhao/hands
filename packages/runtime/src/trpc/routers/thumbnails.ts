/**
 * tRPC Router for Thumbnail Operations
 *
 * Type-safe API for page/block thumbnail CRUD.
 */

import type { PGlite } from "@electric-sql/pglite";
import { initTRPC, TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  getThumbnails,
  saveThumbnail,
  deleteThumbnails,
  type ThumbnailInput,
} from "../../thumbnails/index.js";

// ============================================================================
// Context
// ============================================================================

export interface ThumbnailsContext {
  db: PGlite | null;
  isDbReady: boolean;
}

// ============================================================================
// tRPC Setup
// ============================================================================

const t = initTRPC.context<ThumbnailsContext>().create();

const dbReadyProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.isDbReady || !ctx.db) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Database not ready",
    });
  }
  return next({ ctx: { ...ctx, db: ctx.db } });
});

// ============================================================================
// Input Schemas
// ============================================================================

const thumbnailTypeSchema = z.enum(["page", "block"]);
const themeSchema = z.enum(["light", "dark"]);

const getThumbnailInput = z.object({
  type: thumbnailTypeSchema,
  contentId: z.string().min(1),
});

const saveThumbnailInput = z.object({
  type: thumbnailTypeSchema,
  contentId: z.string().min(1),
  theme: themeSchema,
  thumbnail: z.string().min(1), // base64 PNG
  lqip: z.string().min(1), // base64 PNG (tiny blurred version)
  contentHash: z.string().optional(),
});

const deleteThumbnailInput = z.object({
  type: thumbnailTypeSchema,
  contentId: z.string().min(1),
});

// ============================================================================
// Router
// ============================================================================

export const thumbnailsRouter = t.router({
  /** Get thumbnails for a page/block (both themes) */
  get: dbReadyProcedure
    .input(getThumbnailInput)
    .query(async ({ ctx, input }) => {
      try {
        const thumbnails = await getThumbnails(ctx.db, input.type, input.contentId);
        return thumbnails;
      } catch (err) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to fetch thumbnails: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }),

  /** Save a thumbnail */
  save: dbReadyProcedure
    .input(saveThumbnailInput)
    .mutation(async ({ ctx, input }) => {
      try {
        const thumbnailInput: ThumbnailInput = {
          type: input.type,
          contentId: input.contentId,
          theme: input.theme,
          thumbnail: input.thumbnail,
          lqip: input.lqip,
          contentHash: input.contentHash,
        };

        await saveThumbnail(ctx.db, thumbnailInput);
        return { success: true };
      } catch (err) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to save thumbnail: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }),

  /** Delete thumbnails for a page/block (all themes) */
  delete: dbReadyProcedure
    .input(deleteThumbnailInput)
    .mutation(async ({ ctx, input }) => {
      try {
        await deleteThumbnails(ctx.db, input.type, input.contentId);
        return { success: true };
      } catch (err) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to delete thumbnails: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }),
});

export type ThumbnailsRouter = typeof thumbnailsRouter;
