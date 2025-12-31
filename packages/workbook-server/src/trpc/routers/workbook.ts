/**
 * tRPC Router for Workbook Operations
 *
 * Type-safe API for workbook manifest and block CRUD operations.
 * Uses the unified workbook discovery module.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { initTRPC, TRPCError } from "@trpc/server";
import { z } from "zod";
import { discoverWorkbook } from "../../workbook/discovery.js";

// ============================================================================
// Context
// ============================================================================

export interface WorkbookContext {
  workbookId: string;
  workbookDir: string;
  /** Optional: external config provider */
  getExternalConfig?: () => Promise<Record<string, unknown>>;
  formatBlockSource: (filePath: string) => Promise<boolean>;
  generateDefaultBlockSource: (blockName: string) => string;
}

// ============================================================================
// tRPC Setup
// ============================================================================

const t = initTRPC.context<WorkbookContext>().create();

const publicProcedure = t.procedure;

// ============================================================================
// Input Schemas
// ============================================================================

const blockIdInput = z.object({
  blockId: z.string().min(1),
});

const saveBlockSourceInput = z.object({
  blockId: z.string().min(1),
  source: z.string(),
});

const createBlockInput = z.object({
  blockId: z.string().min(1),
  source: z.string().optional(),
});

const moveBlockInput = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
});

const duplicateBlockInput = z.object({
  blockId: z.string().min(1),
  newBlockId: z.string().optional(),
});

// ============================================================================
// Helpers
// ============================================================================

function validateBlockId(blockId: string): void {
  const segments = blockId.split("/");
  for (const segment of segments) {
    if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(segment)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "Invalid blockId - each path segment must start with letter, contain only alphanumeric, dashes, underscores",
      });
    }
  }
}

function findBlockFile(blocksDir: string, blockId: string): string | null {
  for (const ext of [".tsx", ".ts"]) {
    const filePath = join(blocksDir, blockId + ext);
    if (existsSync(filePath)) {
      return filePath;
    }
  }
  return null;
}

// ============================================================================
// Router
// ============================================================================

export const workbookRouter = t.router({
  /** Get workbook manifest (blocks, actions, config) */
  manifest: publicProcedure.query(async ({ ctx }) => {
    const discovery = await discoverWorkbook({ rootPath: ctx.workbookDir });

    // Get external config if available
    const config = ctx.getExternalConfig ? await ctx.getExternalConfig() : {};

    const blocks = discovery.blocks.map((b) => ({
      id: b.id,
      title: b.meta.title || b.id,
      path: b.path,
      parentDir: b.parentDir,
      uninitialized: b.uninitialized,
    }));

    return {
      workbookId: ctx.workbookId,
      workbookDir: ctx.workbookDir,
      // Domains come from trpc.domains.list endpoint
      blocks,
      actions: discovery.actions,
      config,
      isEmpty: blocks.length === 0,
      errors: discovery.errors,
    };
  }),

  /** Block operations */
  blocks: t.router({
    /** Get block source code */
    getSource: publicProcedure.input(blockIdInput).query(async ({ ctx, input }) => {
      const blocksDir = join(ctx.workbookDir, "blocks");
      const filePath = findBlockFile(blocksDir, input.blockId);

      if (!filePath) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Block not found" });
      }

      const source = readFileSync(filePath, "utf-8");
      return {
        blockId: input.blockId,
        filePath,
        source,
      };
    }),

    /** Save block source code */
    saveSource: publicProcedure.input(saveBlockSourceInput).mutation(async ({ ctx, input }) => {
      const blocksDir = join(ctx.workbookDir, "blocks");

      // Find existing file or use .tsx for new files
      let filePath = findBlockFile(blocksDir, input.blockId);
      if (!filePath) {
        filePath = join(blocksDir, `${input.blockId}.tsx`);
      }

      try {
        const { mkdirSync, openSync, writeSync, fsyncSync, closeSync } = await import("node:fs");

        // Ensure parent directories exist (for nested blocks)
        const parentDir = filePath.substring(0, filePath.lastIndexOf("/"));
        if (!existsSync(parentDir)) {
          mkdirSync(parentDir, { recursive: true });
        }

        // Write with explicit fsync
        const fd = openSync(filePath, "w");
        writeSync(fd, input.source, 0, "utf-8");
        fsyncSync(fd);
        closeSync(fd);

        // Auto-format after save
        await ctx.formatBlockSource(filePath);

        // Read back formatted source
        const formattedSource = readFileSync(filePath, "utf-8");

        return {
          blockId: input.blockId,
          filePath,
          source: formattedSource,
        };
      } catch (err) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to write block: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }),

    /** Create a new block */
    create: publicProcedure.input(createBlockInput).mutation(async ({ ctx, input }) => {
      validateBlockId(input.blockId);

      const blocksDir = join(ctx.workbookDir, "blocks");
      const filePath = join(blocksDir, `${input.blockId}.tsx`);

      if (existsSync(filePath)) {
        throw new TRPCError({ code: "CONFLICT", message: "Block already exists" });
      }

      const segments = input.blockId.split("/");
      const blockName = segments[segments.length - 1];
      const source = input.source ?? ctx.generateDefaultBlockSource(blockName);

      try {
        const { writeFileSync, mkdirSync } = await import("node:fs");

        const parentDir = filePath.substring(0, filePath.lastIndexOf("/"));
        if (!existsSync(parentDir)) {
          mkdirSync(parentDir, { recursive: true });
        }

        writeFileSync(filePath, source, "utf-8");

        return {
          blockId: input.blockId,
          filePath,
        };
      } catch (err) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to create block: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }),

    /** Delete a block */
    delete: publicProcedure.input(blockIdInput).mutation(async ({ ctx, input }) => {
      const blocksDir = join(ctx.workbookDir, "blocks");
      const filePath = findBlockFile(blocksDir, input.blockId);

      if (!filePath) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Block not found" });
      }

      const { unlinkSync } = await import("node:fs");
      unlinkSync(filePath);

      return { blockId: input.blockId };
    }),

    /** Duplicate a block */
    duplicate: publicProcedure.input(duplicateBlockInput).mutation(async ({ ctx, input }) => {
      const blocksDir = join(ctx.workbookDir, "blocks");
      const sourceFile = findBlockFile(blocksDir, input.blockId);

      if (!sourceFile) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Block not found" });
      }

      // Generate new ID
      const newBlockId = input.newBlockId ?? `${input.blockId}-copy`;
      validateBlockId(newBlockId);

      const ext = sourceFile.endsWith(".tsx") ? ".tsx" : ".ts";
      const targetPath = join(blocksDir, newBlockId + ext);

      if (existsSync(targetPath)) {
        throw new TRPCError({ code: "CONFLICT", message: "Target block already exists" });
      }

      const { copyFileSync, mkdirSync } = await import("node:fs");

      const parentDir = targetPath.substring(0, targetPath.lastIndexOf("/"));
      if (!existsSync(parentDir)) {
        mkdirSync(parentDir, { recursive: true });
      }

      copyFileSync(sourceFile, targetPath);

      return {
        blockId: input.blockId,
        newBlockId,
        filePath: targetPath,
      };
    }),

    /** Move/rename a block with import updates */
    move: publicProcedure.input(moveBlockInput).mutation(async ({ ctx, input }) => {
      const blocksDir = join(ctx.workbookDir, "blocks");

      let sourceExt: string | null = null;
      for (const ext of [".tsx", ".ts"]) {
        if (existsSync(join(blocksDir, input.from + ext))) {
          sourceExt = ext;
          break;
        }
      }

      if (!sourceExt) {
        throw new TRPCError({ code: "NOT_FOUND", message: `Block not found: ${input.from}` });
      }

      const sourcePath = join(blocksDir, input.from + sourceExt);
      const targetPath = join(blocksDir, input.to + sourceExt);

      if (existsSync(targetPath)) {
        throw new TRPCError({ code: "CONFLICT", message: `Target already exists: ${input.to}` });
      }

      try {
        const { Project } = await import("ts-morph");
        const tsconfigPath = join(ctx.workbookDir, "tsconfig.json");

        let project: InstanceType<typeof Project>;
        if (existsSync(tsconfigPath)) {
          project = new Project({ tsConfigFilePath: tsconfigPath });
        } else {
          project = new Project({ useInMemoryFileSystem: false });
          project.addSourceFilesAtPaths(join(blocksDir, "**/*.{ts,tsx}"));
        }

        const sourceFile = project.getSourceFile(sourcePath);
        if (!sourceFile) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Could not parse source file",
          });
        }

        const { mkdirSync } = await import("node:fs");
        const targetDir = targetPath.substring(0, targetPath.lastIndexOf("/"));
        if (!existsSync(targetDir)) {
          mkdirSync(targetDir, { recursive: true });
        }

        sourceFile.move(targetPath);
        await project.save();

        return {
          from: input.from,
          to: input.to,
          message: "Block moved and imports updated",
        };
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to move block: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }),

    /** Format block source */
    format: publicProcedure.input(blockIdInput).mutation(async ({ ctx, input }) => {
      const blocksDir = join(ctx.workbookDir, "blocks");
      const filePath = findBlockFile(blocksDir, input.blockId);

      if (!filePath) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Block not found" });
      }

      const success = await ctx.formatBlockSource(filePath);
      return { success };
    }),
  }),
});

export type WorkbookRouter = typeof workbookRouter;
