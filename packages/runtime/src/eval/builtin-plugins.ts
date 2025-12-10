/**
 * Built-in eval plugins
 *
 * These are the default plugins that ship with the runtime.
 */

import { join } from "node:path"
import { readdir, readFile } from "node:fs/promises"
import type { EvalPlugin, EvalContext, PluginResult } from "./plugins"
import { parseWranglerConfig } from "../wrangler/parser"
import { compilePage } from "../pages/mdx"
import {
  checkTypescript,
  formatCode,
  findUnused,
} from "@hands/stdlib"

/**
 * Wrangler config parsing plugin
 * Order: 50 (pre-processing)
 */
export const wranglerPlugin: EvalPlugin = {
  name: "wrangler",
  order: 50,
  parallel: true,
  async eval(ctx: EvalContext): Promise<PluginResult> {
    const config = await parseWranglerConfig(ctx.workbookDir)

    return {
      name: "wrangler",
      duration: 0,
      ok: config !== null,
      errors: config === null ? [{ message: "No wrangler.toml found" }] : [],
      warnings: [],
      data: { config },
    }
  },
}

/**
 * Code formatting plugin
 * Order: 100 (transformation)
 * Sequential because it modifies files
 */
export const formatPlugin: EvalPlugin = {
  name: "format",
  order: 100,
  parallel: false, // Must run sequentially - modifies files
  async eval(ctx: EvalContext): Promise<PluginResult> {
    if (!ctx.autoFix) {
      // Just check, don't fix
      const { checkFormat } = await import("@hands/stdlib")
      const errors = await checkFormat(ctx.workbookDir)
      return {
        name: "format",
        duration: 0,
        ok: errors.length === 0,
        errors: errors.map((e) => ({ message: e })),
        warnings: [],
      }
    }

    const result = await formatCode(ctx.workbookDir)

    return {
      name: "format",
      duration: 0,
      ok: result.errors.length === 0,
      errors: result.errors.map((e) => ({ message: e })),
      warnings: [],
      fixed: result.fixed,
    }
  },
}

/**
 * TypeScript type checking plugin
 * Order: 200 (validation)
 */
export const typescriptPlugin: EvalPlugin = {
  name: "typescript",
  order: 200,
  parallel: true,
  async eval(ctx: EvalContext): Promise<PluginResult> {
    const result = await checkTypescript(ctx.workbookDir)

    return {
      name: "typescript",
      duration: 0,
      ok: result.errors.length === 0,
      errors: result.errors.map((e) => ({
        file: e.file,
        line: e.line,
        column: e.column,
        message: e.message,
        code: e.code,
      })),
      warnings: result.warnings.map((w) => ({
        file: w.file,
        line: w.line,
        column: w.column,
        message: w.message,
        code: w.code,
      })),
      data: result,
    }
  },
}

/**
 * Unused code detection plugin
 * Order: 300 (analysis)
 */
export const unusedPlugin: EvalPlugin = {
  name: "unused",
  order: 300,
  parallel: true,
  async eval(ctx: EvalContext): Promise<PluginResult> {
    const result = await findUnused(ctx.workbookDir)

    const warnings = [
      ...result.exports.map((e) => ({ message: `Unused export: ${e}` })),
      ...result.files.map((f) => ({ message: `Unused file: ${f}` })),
    ]

    return {
      name: "unused",
      duration: 0,
      ok: true, // Unused code is a warning, not an error
      errors: [],
      warnings,
      data: result,
    }
  },
}

/**
 * Block references validation plugin
 * Order: 250 (validation - after typescript)
 *
 * Validates that all <Block src="..."> references in pages/
 * point to existing blocks in blocks/
 */
export const blockRefsPlugin: EvalPlugin = {
  name: "blockRefs",
  order: 250,
  parallel: true,
  async eval(ctx: EvalContext): Promise<PluginResult> {
    const pagesDir = join(ctx.workbookDir, "pages")
    const blocksDir = join(ctx.workbookDir, "blocks")

    // Get available blocks
    let availableBlocks: Set<string>
    try {
      const blockFiles = await readdir(blocksDir)
      availableBlocks = new Set(
        blockFiles
          .filter((f) => f.endsWith(".tsx") || f.endsWith(".ts"))
          .filter((f) => !f.startsWith("_")) // Exclude private files
          .map((f) => f.replace(/\.(tsx?|ts)$/, ""))
      )
    } catch {
      // No blocks directory - nothing to validate against
      return {
        name: "blockRefs",
        duration: 0,
        ok: true,
        errors: [],
        warnings: [],
        data: { references: [], missing: [] },
      }
    }

    // Get all pages and their block references
    let pageFiles: string[]
    try {
      pageFiles = (await readdir(pagesDir)).filter(
        (f) => f.endsWith(".md") || f.endsWith(".mdx")
      )
    } catch {
      // No pages directory
      return {
        name: "blockRefs",
        duration: 0,
        ok: true,
        errors: [],
        warnings: [],
        data: { references: [], missing: [] },
      }
    }

    const allRefs: Array<{ page: string; src: string; line?: number }> = []
    const missingRefs: Array<{ page: string; src: string; available: string[] }> = []

    for (const pageFile of pageFiles) {
      try {
        const content = await readFile(join(pagesDir, pageFile), "utf-8")
        const compiled = compilePage(content)

        for (const block of compiled.blocks) {
          allRefs.push({ page: pageFile, src: block.id })

          if (!availableBlocks.has(block.id)) {
            missingRefs.push({
              page: pageFile,
              src: block.id,
              available: Array.from(availableBlocks).slice(0, 5), // Suggest up to 5 blocks
            })
          }
        }
      } catch (err) {
        // Skip pages that can't be parsed
        continue
      }
    }

    const errors = missingRefs.map((ref) => ({
      file: `pages/${ref.page}`,
      message: `Block "${ref.src}" not found. Available: ${ref.available.join(", ") || "(none)"}`,
    }))

    return {
      name: "blockRefs",
      duration: 0,
      ok: errors.length === 0,
      errors,
      warnings: [],
      data: {
        references: allRefs,
        missing: missingRefs,
        availableBlocks: Array.from(availableBlocks),
      },
    }
  },
}

/**
 * Get all built-in plugins
 */
export function getBuiltinPlugins(): EvalPlugin[] {
  return [
    wranglerPlugin,
    formatPlugin,
    typescriptPlugin,
    blockRefsPlugin,
    unusedPlugin,
  ]
}
