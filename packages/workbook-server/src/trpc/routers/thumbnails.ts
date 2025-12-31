/**
 * tRPC Router for Thumbnail Operations
 *
 * Thumbnails are stored as files in {workbookDir}/.hands/thumbnails/
 * Structure: .hands/thumbnails/{type}/{contentId}/{theme}.png
 */

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { initTRPC } from "@trpc/server";
import { z } from "zod";

// ============================================================================
// Context
// ============================================================================

export interface ThumbnailsContext {
  workbookDir: string;
}

// ============================================================================
// tRPC Setup
// ============================================================================

const t = initTRPC.context<ThumbnailsContext>().create();

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
// Helpers
// ============================================================================

function getThumbnailDir(workbookDir: string, type: string, contentId: string): string {
  return join(workbookDir, ".hands", "thumbnails", type, contentId);
}

function getThumbnailPath(
  workbookDir: string,
  type: string,
  contentId: string,
  theme: string,
): string {
  return join(getThumbnailDir(workbookDir, type, contentId), `${theme}.json`);
}

interface StoredThumbnail {
  type: "page" | "block";
  contentId: string;
  theme: "light" | "dark";
  thumbnail: string;
  lqip: string;
  contentHash?: string;
  createdAt: string;
}

function readThumbnail(
  workbookDir: string,
  type: string,
  contentId: string,
  theme: string,
): StoredThumbnail | undefined {
  const path = getThumbnailPath(workbookDir, type, contentId, theme);
  if (!existsSync(path)) return undefined;

  try {
    const content = readFileSync(path, "utf-8");
    return JSON.parse(content) as StoredThumbnail;
  } catch {
    return undefined;
  }
}

// ============================================================================
// Router
// ============================================================================

export const thumbnailsRouter = t.router({
  /** Get thumbnails for a page/block (both themes) */
  get: t.procedure
    .input(getThumbnailInput)
    .query(({ ctx, input }): { light?: StoredThumbnail; dark?: StoredThumbnail } => {
      const light = readThumbnail(ctx.workbookDir, input.type, input.contentId, "light");
      const dark = readThumbnail(ctx.workbookDir, input.type, input.contentId, "dark");
      return { light, dark };
    }),

  /** Save a thumbnail */
  save: t.procedure.input(saveThumbnailInput).mutation(({ ctx, input }) => {
    const dir = getThumbnailDir(ctx.workbookDir, input.type, input.contentId);
    const path = getThumbnailPath(ctx.workbookDir, input.type, input.contentId, input.theme);

    // Ensure directory exists
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const data: StoredThumbnail = {
      type: input.type,
      contentId: input.contentId,
      theme: input.theme,
      thumbnail: input.thumbnail,
      lqip: input.lqip,
      contentHash: input.contentHash,
      createdAt: new Date().toISOString(),
    };

    writeFileSync(path, JSON.stringify(data));
    return { success: true };
  }),

  /** Delete thumbnails for a page/block (all themes) */
  delete: t.procedure.input(deleteThumbnailInput).mutation(({ ctx, input }) => {
    const dir = getThumbnailDir(ctx.workbookDir, input.type, input.contentId);

    // Delete both theme files if they exist
    for (const theme of ["light", "dark"]) {
      const path = join(dir, `${theme}.json`);
      if (existsSync(path)) {
        try {
          unlinkSync(path);
        } catch {
          // Ignore errors
        }
      }
    }

    return { success: true };
  }),
});

export type ThumbnailsRouter = typeof thumbnailsRouter;
