/**
 * Workbook Discovery
 *
 * Unified discovery for blocks, pages, and UI components.
 */

import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type {
  DiscoveredBlock,
  DiscoveredComponent,
  DiscoveredPage,
  DiscoveryError,
  DiscoveryResult,
  ResolvedWorkbookConfig,
  WorkbookConfig,
  WorkbookManifest,
} from "./types.js";

// Re-export WorkbookConfig for convenience
export type { WorkbookConfig } from "./types.js";
import { extractBlockMeta, validateBlockFile } from "./validate.js";

// ============================================================================
// Configuration
// ============================================================================

export function resolveConfig(config: WorkbookConfig): ResolvedWorkbookConfig {
  const { rootPath } = config;
  return {
    rootPath,
    blocksDir: config.blocksDir ?? join(rootPath, "blocks"),
    pagesDir: config.pagesDir ?? join(rootPath, "pages"),
    uiDir: config.uiDir ?? join(rootPath, "ui"),
    outDir: config.outDir ?? join(rootPath, ".hands"),
  };
}

// ============================================================================
// Block Discovery
// ============================================================================

export interface DiscoverBlocksOptions {
  /** Patterns to exclude (default: none) */
  exclude?: string[];
}

export async function discoverBlocks(
  blocksDir: string,
  options: DiscoverBlocksOptions = {}
): Promise<DiscoveryResult<DiscoveredBlock>> {
  const items: DiscoveredBlock[] = [];
  const errors: DiscoveryError[] = [];

  if (!existsSync(blocksDir)) {
    return { items, errors };
  }

  const files = await findFiles(blocksDir, "", {
    extensions: [".tsx"],
    excludePatterns: options.exclude ?? [],
    excludeSuffixes: [".types.tsx", ".types.ts"],
  });

  for (const file of files) {
    const filePath = join(blocksDir, file);
    const id = file.replace(/\.tsx$/, "");
    const parentDir = dirname(file) === "." ? "" : dirname(file);

    try {
      const validation = await validateBlockFile(filePath);

      if (!validation.valid) {
        errors.push({ file, error: validation.error || "Unknown validation error" });
        continue;
      }

      const filename = basename(file, ".tsx");

      items.push({
        id,
        path: file,
        parentDir,
        meta: validation.meta || { title: filename },
        uninitialized: validation.uninitialized,
      });
    } catch (err) {
      errors.push({
        file,
        error: `Failed to process: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  return { items, errors };
}

// ============================================================================
// Page Discovery
// ============================================================================

const PAGE_EXTENSIONS = [".md", ".mdx", ".plate.json"];

export async function discoverPages(pagesDir: string): Promise<DiscoveryResult<DiscoveredPage>> {
  const items: DiscoveredPage[] = [];
  const errors: DiscoveryError[] = [];

  if (!existsSync(pagesDir)) {
    return { items, errors };
  }

  const files = await findFiles(pagesDir, "", {
    extensions: PAGE_EXTENSIONS,
    excludePatterns: [],
    excludeSuffixes: [],
  });

  for (const file of files) {
    const ext = getExtension(file, PAGE_EXTENSIONS);
    if (!ext) continue;

    try {
      const route = pathToRoute(file, ext);
      items.push({ route, path: file, ext });
    } catch (err) {
      errors.push({
        file,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { items, errors };
}

function pathToRoute(path: string, ext: string): string {
  let route = path.slice(0, -ext.length);

  // Handle index files
  if (route.endsWith("/index") || route === "index") {
    route = route.slice(0, -5) || "/";
  }

  // Ensure leading slash and normalize
  if (!route.startsWith("/")) {
    route = `/${route}`;
  }
  route = route.replace(/\\/g, "/");

  return route || "/";
}

// ============================================================================
// UI Component Discovery
// ============================================================================

export async function discoverComponents(
  uiDir: string
): Promise<DiscoveryResult<DiscoveredComponent>> {
  const items: DiscoveredComponent[] = [];
  const errors: DiscoveryError[] = [];

  if (!existsSync(uiDir)) {
    return { items, errors };
  }

  const files = await findFiles(uiDir, "", {
    extensions: [".tsx", ".ts"],
    excludePatterns: [],
    excludeSuffixes: [".types.tsx", ".types.ts", ".test.tsx", ".test.ts"],
  });

  for (const file of files) {
    const filePath = join(uiDir, file);

    try {
      const content = await readFile(filePath, "utf-8");
      const name = basename(file).replace(/\.(tsx|ts)$/, "");
      const isClientComponent = content.includes('"use client"') || content.includes("'use client'");

      items.push({ name, path: file, isClientComponent });
    } catch (err) {
      errors.push({
        file,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { items, errors };
}

// ============================================================================
// Full Workbook Discovery
// ============================================================================

export async function discoverWorkbook(config: WorkbookConfig): Promise<WorkbookManifest> {
  const resolved = resolveConfig(config);

  const [blocksResult, pagesResult, componentsResult] = await Promise.all([
    discoverBlocks(resolved.blocksDir),
    discoverPages(resolved.pagesDir),
    discoverComponents(resolved.uiDir),
  ]);

  return {
    blocks: blocksResult.items,
    pages: pagesResult.items,
    components: componentsResult.items,
    errors: [...blocksResult.errors, ...pagesResult.errors, ...componentsResult.errors],
    timestamp: Date.now(),
  };
}

// ============================================================================
// File System Utilities
// ============================================================================

interface FindFilesOptions {
  extensions: string[];
  excludePatterns: string[];
  excludeSuffixes: string[];
}

async function findFiles(
  baseDir: string,
  subDir: string,
  options: FindFilesOptions
): Promise<string[]> {
  const files: string[] = [];
  const currentDir = subDir ? join(baseDir, subDir) : baseDir;

  let entries;
  try {
    entries = await readdir(currentDir, { withFileTypes: true });
  } catch {
    return files;
  }

  for (const entry of entries) {
    const relativePath = subDir ? `${subDir}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      // Check if directory should be excluded
      if (matchesAnyPattern(relativePath, options.excludePatterns)) {
        continue;
      }
      const subFiles = await findFiles(baseDir, relativePath, options);
      files.push(...subFiles);
      continue;
    }

    // Check extension
    const ext = getExtension(entry.name, options.extensions);
    if (!ext) continue;

    // Check exclude suffixes
    if (options.excludeSuffixes.some((suffix) => entry.name.endsWith(suffix))) {
      continue;
    }

    // Check exclude patterns
    if (matchesAnyPattern(relativePath, options.excludePatterns)) {
      continue;
    }

    files.push(relativePath);
  }

  return files.sort();
}

function getExtension(filename: string, extensions: string[]): string | null {
  for (const ext of extensions) {
    if (filename.endsWith(ext)) {
      return ext;
    }
  }
  return null;
}

function matchesAnyPattern(path: string, patterns: string[]): boolean {
  return patterns.some((pattern) => matchPattern(path, pattern));
}

function matchPattern(path: string, pattern: string): boolean {
  // Convert glob pattern to regex
  const regex = new RegExp(
    `^${pattern
      .replace(/\*\*/g, "<<GLOBSTAR>>")
      .replace(/\*/g, "[^/]*")
      .replace(/<<GLOBSTAR>>/g, ".*")
      .replace(/\?/g, ".")}$`
  );
  return regex.test(path);
}
