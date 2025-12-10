/**
 * Block Discovery
 *
 * Scans the blocks/ directory to find all block files.
 */

import { existsSync } from "fs"
import { readdir } from "fs/promises"
import { join, basename } from "path"
import type { BlockMeta, DiscoveredBlock } from "@hands/stdlib"
import { validateBlockFile } from "./validate.js"

export interface BlockDiscoveryResult {
  /** Successfully discovered blocks */
  blocks: DiscoveredBlock[]

  /** Errors encountered during discovery */
  errors: Array<{
    file: string
    error: string
  }>
}

export interface DiscoverBlocksOptions {
  /** Patterns to include (default: all *.tsx files) */
  include?: string[]

  /** Patterns to exclude (default: ui/** ) */
  exclude?: string[]
}

/**
 * Discover blocks in a directory
 *
 * Scans the blocks/ directory for .tsx files, validates them,
 * and returns a list of discovered blocks.
 *
 * @param blocksDir - Path to the blocks directory
 * @param options - Discovery options
 */
export async function discoverBlocks(
  blocksDir: string,
  options: DiscoverBlocksOptions = {}
): Promise<BlockDiscoveryResult> {
  const blocks: DiscoveredBlock[] = []
  const errors: Array<{ file: string; error: string }> = []

  // Check if directory exists
  if (!existsSync(blocksDir)) {
    return { blocks, errors }
  }

  // Find all .tsx files (not in ui/)
  const files = await findBlockFiles(blocksDir, options)

  for (const file of files) {
    const filePath = join(blocksDir, file)
    const id = basename(file, ".tsx")

    try {
      // Validate the file
      const validation = await validateBlockFile(filePath)

      if (!validation.valid) {
        errors.push({ file, error: validation.error || "Unknown validation error" })
        continue
      }

      // Create lazy loader
      const load = async () => {
        const module = await import(filePath)
        return {
          default: module.default,
          meta: module.meta as BlockMeta | undefined,
        }
      }

      blocks.push({
        id,
        path: file,
        meta: validation.meta || { title: id },
        load,
      })
    } catch (err) {
      errors.push({
        file,
        error: `Failed to process: ${err instanceof Error ? err.message : String(err)}`,
      })
    }
  }

  return { blocks, errors }
}

/**
 * Find block files in a directory
 */
async function findBlockFiles(
  blocksDir: string,
  options: DiscoverBlocksOptions
): Promise<string[]> {
  const files: string[] = []
  const entries = await readdir(blocksDir, { withFileTypes: true })

  for (const entry of entries) {
    // Skip directories (including ui/)
    if (entry.isDirectory()) continue

    // Only process .tsx files
    if (!entry.name.endsWith(".tsx")) continue

    // Check exclude patterns
    if (options.exclude?.some((pattern) => matchPattern(entry.name, pattern))) {
      continue
    }

    // Check include patterns (if specified)
    if (options.include && !options.include.some((pattern) => matchPattern(entry.name, pattern))) {
      continue
    }

    files.push(entry.name)
  }

  return files.sort()
}

/**
 * Simple pattern matching (supports * wildcard)
 */
function matchPattern(filename: string, pattern: string): boolean {
  // Convert pattern to regex
  const regex = new RegExp(
    "^" + pattern.replace(/\*/g, ".*").replace(/\?/g, ".") + "$"
  )
  return regex.test(filename)
}
