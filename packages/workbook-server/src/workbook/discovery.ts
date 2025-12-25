/**
 * Workbook Discovery
 *
 * Unified discovery for blocks, pages, UI components, database tables, and actions.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { basename, dirname, join, relative } from "node:path";
import type { ActionDefinition } from "@hands/core/primitives";
import type {
  DiscoveredAction,
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
    pagesDir: config.pagesDir ?? join(rootPath, "pages"),
    pluginsDir: config.pluginsDir ?? join(rootPath, "plugins"),
    uiDir: config.uiDir ?? join(rootPath, "ui"),
    actionsDir: config.actionsDir ?? join(rootPath, "actions"),
    outDir: config.outDir ?? join(rootPath, ".hands"),
  };
}

// ============================================================================
// Block Discovery (TSX components in pages/blocks/)
// ============================================================================

export interface DiscoverBlocksOptions {
  /** Patterns to exclude (default: none) */
  exclude?: string[];
}

/**
 * Discover TSX blocks in the pages/blocks/ subdirectory.
 * Blocks are server components that can be embedded in MDX pages.
 */
export async function discoverBlocks(
  pagesDir: string,
  options: DiscoverBlocksOptions = {}
): Promise<DiscoveryResult<DiscoveredBlock>> {
  const items: DiscoveredBlock[] = [];
  const errors: DiscoveryError[] = [];

  // Blocks are in pages/blocks/ subdirectory
  const blocksDir = join(pagesDir, BLOCKS_SUBDIR);

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
// Action Discovery
// ============================================================================

/**
 * Read secrets from .env.local file
 */
function readEnvFile(workbookDir: string): Map<string, string> {
  const envPath = join(workbookDir, ".env.local");

  if (!existsSync(envPath)) {
    return new Map();
  }

  try {
    const content = readFileSync(envPath, "utf-8");
    const env = new Map<string, string>();

    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const eqIndex = trimmed.indexOf("=");
      if (eqIndex === -1) continue;

      const key = trimmed.slice(0, eqIndex).trim();
      let value = trimmed.slice(eqIndex + 1).trim();

      // Remove surrounding quotes
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      if (key) {
        env.set(key, value);
      }
    }

    return env;
  } catch {
    return new Map();
  }
}

/**
 * Discover a single action file.
 * Always returns an action if the file exists - errors are tracked as state.
 */
async function discoverAction(
  actionPath: string,
  actionId: string,
  secrets: Record<string, string>,
  rootPath: string
): Promise<DiscoveredAction | null> {
  if (!existsSync(actionPath)) {
    return null;
  }

  const basePath = relative(rootPath, actionPath);

  try {
    const mod = await import(actionPath);
    const definition = mod.default as ActionDefinition | undefined;

    if (!definition?.name || !definition?.run) {
      return {
        id: actionId,
        path: basePath,
        valid: false,
        error: "Invalid action: missing 'name' or 'run' export",
      };
    }

    // Check for missing secrets
    const missingSecrets = definition.secrets?.filter((secret) => !secrets[secret]);

    return {
      id: actionId,
      path: basePath,
      valid: true,
      name: definition.name,
      description: definition.description,
      schedule: definition.schedule,
      triggers: definition.triggers ?? ["manual"],
      hasWebhook: definition.triggers?.includes("webhook") ?? false,
      webhookPath: definition.webhookPath,
      secrets: definition.secrets,
      missingSecrets: missingSecrets?.length ? missingSecrets : undefined,
      hasInput: !!definition.input,
      hasSchema: !!definition.schema,
      nextRun: undefined, // TODO: Calculate from cron schedule
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.warn(`[actions] Failed to load action ${actionId}: ${errorMessage}`);

    return {
      id: actionId,
      path: basePath,
      valid: false,
      error: errorMessage,
    };
  }
}

/**
 * Discover all actions in the actions directory.
 *
 * Directory structure:
 * - actions/<name>.ts (single file actions)
 * - actions/<name>/action.ts (folder-based actions)
 */
export async function discoverActions(
  actionsDir: string,
  rootPath: string
): Promise<DiscoveryResult<DiscoveredAction>> {
  const items: DiscoveredAction[] = [];
  const errors: DiscoveryError[] = [];

  if (!existsSync(actionsDir)) {
    return { items, errors };
  }

  const secretsMap = readEnvFile(rootPath);
  const secrets = Object.fromEntries(secretsMap);

  const entries = readdirSync(actionsDir);

  for (const entry of entries) {
    const entryPath = join(actionsDir, entry);

    // Skip hidden files/folders
    if (entry.startsWith(".") || entry.startsWith("_")) {
      continue;
    }

    try {
      const stat = statSync(entryPath);

      if (stat.isDirectory()) {
        // Folder-based action: actions/<name>/action.ts
        const action = await discoverAction(join(entryPath, "action.ts"), entry, secrets, rootPath);
        if (action) items.push(action);
      } else if (entry.endsWith(".ts") && !entry.endsWith(".d.ts")) {
        // Single file action: actions/<name>.ts
        const actionId = basename(entry, ".ts");
        const action = await discoverAction(entryPath, actionId, secrets, rootPath);
        if (action) items.push(action);
      }
    } catch (err) {
      // File system error - still create an action entry with error state
      const actionId = entry.endsWith(".ts") ? basename(entry, ".ts") : entry;
      items.push({
        id: actionId,
        path: join("actions", entry),
        valid: false,
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

  const [blocksResult, pagesResult, pluginsResult, componentsResult, actionsResult] = await Promise.all([
    discoverBlocks(resolved.pagesDir), // Blocks are in pages/blocks/
    discoverPages(resolved.pagesDir),
    discoverPlugins(resolved.pluginsDir),
    discoverComponents(resolved.uiDir),
    discoverActions(resolved.actionsDir, resolved.rootPath),
  ]);

  // Table discovery is sync (bun:sqlite is sync)
  const tablesResult = discoverTables(resolved.rootPath);

  return {
    blocks: blocksResult.items,
    pages: pagesResult.items,
    plugins: pluginsResult.items,
    components: componentsResult.items,
    tables: tablesResult.items,
    actions: actionsResult.items,
    errors: [
      ...blocksResult.errors,
      ...pagesResult.errors,
      ...pluginsResult.errors,
      ...componentsResult.errors,
      ...tablesResult.errors,
      ...actionsResult.errors,
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
