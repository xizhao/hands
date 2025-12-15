/**
 * Block Discovery
 *
 * Scans the blocks/ directory recursively to find all block files.
 * Supports nested folders with path-based block IDs.
 */

import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type { BlockMeta, DiscoveredBlock } from "@hands/stdlib";
import { validateBlockFile } from "./validate.js";

export interface BlockDiscoveryResult {
  /** Successfully discovered blocks */
  blocks: DiscoveredBlock[];

  /** Errors encountered during discovery */
  errors: Array<{
    file: string;
    error: string;
  }>;
}

export interface DiscoverBlocksOptions {
  /** Patterns to include (default: all *.tsx files) */
  include?: string[];

  /** Patterns to exclude (default: ui/** ) */
  exclude?: string[];
}

/**
 * Discover blocks in a directory
 *
 * Recursively scans the blocks/ directory for .tsx files, validates them,
 * and returns a list of discovered blocks with path-based IDs.
 *
 * @param blocksDir - Path to the blocks directory
 * @param options - Discovery options
 */
export async function discoverBlocks(
  blocksDir: string,
  options: DiscoverBlocksOptions = {},
): Promise<BlockDiscoveryResult> {
  const blocks: DiscoveredBlock[] = [];
  const errors: Array<{ file: string; error: string }> = [];

  // Check if directory exists
  if (!existsSync(blocksDir)) {
    return { blocks, errors };
  }

  // Find all .tsx files recursively
  const files = await findBlockFiles(blocksDir, "", options);

  for (const file of files) {
    const filePath = join(blocksDir, file);
    // ID is path without extension: "charts/bar-chart.tsx" -> "charts/bar-chart"
    const id = file.replace(/\.tsx$/, "");
    // Parent dir: "charts/bar-chart.tsx" -> "charts", "foo.tsx" -> ""
    const parentDir = dirname(file) === "." ? "" : dirname(file);

    try {
      // Validate the file
      const validation = await validateBlockFile(filePath);

      if (!validation.valid) {
        errors.push({ file, error: validation.error || "Unknown validation error" });
        continue;
      }

      // Create lazy loader
      const load = async () => {
        const module = await import(filePath);
        return {
          default: module.default,
          meta: module.meta as BlockMeta | undefined,
        };
      };

      // Use filename for title if not specified in meta
      const filename = basename(file, ".tsx");

      blocks.push({
        id,
        path: file,
        parentDir,
        meta: validation.meta || { title: filename },
        load,
      });
    } catch (err) {
      errors.push({
        file,
        error: `Failed to process: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  return { blocks, errors };
}

/**
 * Recursively find block files in a directory
 * @param baseDir - Root blocks directory
 * @param subDir - Current subdirectory relative to baseDir
 * @param options - Discovery options
 */
async function findBlockFiles(
  baseDir: string,
  subDir: string,
  options: DiscoverBlocksOptions,
): Promise<string[]> {
  const files: string[] = [];
  const currentDir = subDir ? join(baseDir, subDir) : baseDir;
  const entries = await readdir(currentDir, { withFileTypes: true });

  for (const entry of entries) {
    const relativePath = subDir ? `${subDir}/${entry.name}` : entry.name;

    // Recursively scan subdirectories (except excluded ones like ui/)
    if (entry.isDirectory()) {
      // Check if directory should be excluded
      if (
        options.exclude?.some(
          (pattern) =>
            matchPattern(relativePath, pattern) || matchPattern(`${relativePath}/`, pattern),
        )
      ) {
        continue;
      }
      // Recurse into subdirectory
      const subFiles = await findBlockFiles(baseDir, relativePath, options);
      files.push(...subFiles);
      continue;
    }

    // Only process .tsx files (but not .types.tsx which are pgtyped generated)
    if (!entry.name.endsWith(".tsx")) continue;
    if (entry.name.endsWith(".types.tsx") || entry.name.endsWith(".types.ts")) continue;

    // Check exclude patterns
    if (options.exclude?.some((pattern) => matchPattern(relativePath, pattern))) {
      continue;
    }

    // Check include patterns (if specified)
    if (
      options.include &&
      !options.include.some((pattern) => matchPattern(relativePath, pattern))
    ) {
      continue;
    }

    files.push(relativePath);
  }

  return files.sort();
}

/**
 * Simple pattern matching (supports * wildcard)
 */
function matchPattern(filename: string, pattern: string): boolean {
  // Convert pattern to regex
  const regex = new RegExp(`^${pattern.replace(/\*/g, ".*").replace(/\?/g, ".")}$`);
  return regex.test(filename);
}
