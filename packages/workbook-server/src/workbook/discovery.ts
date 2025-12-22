/**
 * Workbook Discovery
 *
 * Unified discovery for blocks, pages, UI components, and database tables.
 */

import { existsSync, readFileSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type {
  DiscoveredBlock,
  DiscoveredComponent,
  DiscoveredPage,
  DiscoveredPlugin,
  DiscoveredTable,
  DiscoveryError,
  DiscoveryResult,
  ResolvedWorkbookConfig,
  WorkbookConfig,
  WorkbookManifest,
} from "./types.js";
import { BLOCKS_SUBDIR } from "./types.js";

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
    pluginsDir: config.pluginsDir ?? join(rootPath, "plugins"),
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

/**
 * Check if a path is inside the blocks/ subdirectory
 */
function isBlockPath(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, "/");
  return normalized.startsWith(`${BLOCKS_SUBDIR}/`) || normalized === BLOCKS_SUBDIR;
}

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
      const parentDir = dirname(file) === "." ? "" : dirname(file);
      const isBlock = isBlockPath(file);
      items.push({ route, path: file, ext, parentDir, isBlock });
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
// Table Discovery
// ============================================================================

/**
 * Parse .hands/db.d.ts to discover tables and columns using ts-morph.
 * Re-reads the file on every call since it changes frequently.
 */
export function discoverTables(rootPath: string): DiscoveryResult<DiscoveredTable> {
  const items: DiscoveredTable[] = [];
  const errors: DiscoveryError[] = [];

  const dbTypesPath = join(rootPath, ".hands", "db.d.ts");

  if (!existsSync(dbTypesPath)) {
    return { items, errors };
  }

  try {
    // Use dynamic import to avoid loading ts-morph if not needed
    const { Project } = require("ts-morph") as typeof import("ts-morph");

    // Create a fresh project each time (file changes frequently)
    const project = new Project({ useInMemoryFileSystem: true });
    const content = readFileSync(dbTypesPath, "utf-8");
    const sourceFile = project.createSourceFile("db.d.ts", content);

    // Find the DB interface
    const dbInterface = sourceFile.getInterface("DB");
    if (!dbInterface) {
      return { items, errors };
    }

    // Get all table names from DB interface properties
    for (const prop of dbInterface.getProperties()) {
      const tableName = prop.getName();

      // Skip internal tables
      if (tableName.startsWith("__")) continue;

      // Get the type reference (e.g., "FeatureIdeas")
      const typeNode = prop.getTypeNode();
      const typeName = typeNode?.getText();

      if (!typeName) {
        items.push({ name: tableName, columns: [] });
        continue;
      }

      // Find the interface for this table type
      const tableInterface = sourceFile.getInterface(typeName);
      if (!tableInterface) {
        items.push({ name: tableName, columns: [] });
        continue;
      }

      // Extract column names from the table interface
      const columns = tableInterface.getProperties().map((p) => p.getName());
      items.push({ name: tableName, columns });
    }
  } catch (err) {
    errors.push({
      file: dbTypesPath,
      error: `Failed to parse db types: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  return { items, errors };
}

// ============================================================================
// Plugin Discovery
// ============================================================================

/**
 * Discover plugins in the plugins/ directory.
 * Plugins are TSX components that extend the editor stdlib.
 */
export async function discoverPlugins(
  pluginsDir: string
): Promise<DiscoveryResult<DiscoveredPlugin>> {
  const items: DiscoveredPlugin[] = [];
  const errors: DiscoveryError[] = [];

  if (!existsSync(pluginsDir)) {
    return { items, errors };
  }

  const files = await findFiles(pluginsDir, "", {
    extensions: [".tsx", ".ts"],
    excludePatterns: [],
    excludeSuffixes: [".types.tsx", ".types.ts", ".test.tsx", ".test.ts"],
  });

  for (const file of files) {
    const filePath = join(pluginsDir, file);

    try {
      const content = await readFile(filePath, "utf-8");
      const id = file.replace(/\.(tsx|ts)$/, "");
      const filename = basename(file).replace(/\.(tsx|ts)$/, "");

      // Extract name from JSDoc @plugin tag or use filename
      const pluginMatch = content.match(/@plugin\s+(.+)/);
      const name = pluginMatch?.[1]?.trim() || formatPluginName(filename);

      // Extract description from JSDoc @description tag
      const descMatch = content.match(/@description\s+(.+)/);
      const description = descMatch?.[1]?.trim();

      items.push({ id, path: file, name, description });
    } catch (err) {
      errors.push({
        file,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { items, errors };
}

/**
 * Convert filename to display name (e.g., "custom-chart" -> "Custom Chart")
 */
function formatPluginName(filename: string): string {
  return filename
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// ============================================================================
// Full Workbook Discovery
// ============================================================================

export async function discoverWorkbook(config: WorkbookConfig): Promise<WorkbookManifest> {
  const resolved = resolveConfig(config);

  const [blocksResult, pagesResult, pluginsResult, componentsResult] = await Promise.all([
    discoverBlocks(resolved.blocksDir),
    discoverPages(resolved.pagesDir),
    discoverPlugins(resolved.pluginsDir),
    discoverComponents(resolved.uiDir),
  ]);

  // Table discovery is sync (bun:sqlite is sync)
  const tablesResult = discoverTables(resolved.rootPath);

  return {
    blocks: blocksResult.items,
    pages: pagesResult.items,
    plugins: pluginsResult.items,
    components: componentsResult.items,
    tables: tablesResult.items,
    errors: [
      ...blocksResult.errors,
      ...pagesResult.errors,
      ...pluginsResult.errors,
      ...componentsResult.errors,
      ...tablesResult.errors,
    ],
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
