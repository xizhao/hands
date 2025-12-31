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
  DiscoveredDomain,
  DiscoveredPage,
  DiscoveredPlugin,
  DiscoveredTable,
  DiscoveryError,
  DiscoveryResult,
  DomainColumn,
  DomainForeignKey,
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
// Domain Discovery (tables as first-class entities)
// ============================================================================

/** Common patterns in junction/relation table names */
const JUNCTION_PATTERNS = [
  /_to_/i,
  /_x_/i,
  /_rel_/i,
  /_link_/i,
  /_map_/i,
  /_join_/i,
  /_bridge_/i,
  /_assoc_/i,
];

/**
 * Generate a stable hash from schema components.
 * Used for detecting schema changes.
 */
function generateSchemaHash(
  tableName: string,
  columns: DomainColumn[],
  foreignKeys: DomainForeignKey[]
): string {
  const normalized = {
    table: tableName,
    columns: columns
      .map((c) => `${c.name}:${c.type}:${c.nullable}:${c.isPrimary}`)
      .sort()
      .join("|"),
    fks: foreignKeys
      .map((fk) => `${fk.column}->${fk.referencedTable}.${fk.referencedColumn}`)
      .sort()
      .join("|"),
  };

  const str = JSON.stringify(normalized);

  // Simple hash function (djb2)
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}

/**
 * Detect if a table is a relation/junction table.
 * These are excluded from domains.
 */
function detectRelationTable(
  tableName: string,
  columns: DomainColumn[],
  foreignKeys: DomainForeignKey[],
  allTableNames: string[]
): { isRelation: boolean; reason?: string } {
  // Check for junction naming patterns
  for (const pattern of JUNCTION_PATTERNS) {
    if (pattern.test(tableName)) {
      return {
        isRelation: true,
        reason: `Table name matches junction pattern: ${pattern}`,
      };
    }
  }

  // Check if table name is combination of two other tables
  for (const table1 of allTableNames) {
    for (const table2 of allTableNames) {
      if (table1 === table2 || table1 === tableName || table2 === tableName) {
        continue;
      }

      const combo1 = `${table1}_${table2}`;
      const combo2 = `${table2}_${table1}`;

      if (tableName === combo1 || tableName === combo2) {
        return {
          isRelation: true,
          reason: `Table name is combination of ${table1} and ${table2}`,
        };
      }
    }
  }

  // Check if table has exactly 2 FKs and minimal other columns
  if (foreignKeys.length === 2) {
    const nonFkColumns = columns.filter(
      (col) =>
        !foreignKeys.some((fk) => fk.column === col.name) && !col.isPrimary
    );

    // If only has FK columns + optional timestamps/id, likely a junction
    const isMinimalJunction =
      nonFkColumns.length <= 2 &&
      nonFkColumns.every((col) =>
        ["created_at", "updated_at", "id", "created", "modified"].includes(
          col.name.toLowerCase()
        )
      );

    if (isMinimalJunction) {
      return {
        isRelation: true,
        reason: "Table has 2 foreign keys with minimal other columns",
      };
    }
  }

  return { isRelation: false };
}

/**
 * Convert table name to display name.
 */
function toDisplayName(tableName: string): string {
  return tableName
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Discover domains from the SQLite database.
 * Domains are non-relation tables treated as first-class entities.
 */
export function discoverDomains(
  rootPath: string,
  pages: DiscoveredPage[]
): DiscoveryResult<DiscoveredDomain> {
  const items: DiscoveredDomain[] = [];
  const errors: DiscoveryError[] = [];

  // Import database functions
  let getWorkbookDb: (workbookDir: string) => import("bun:sqlite").Database;
  try {
    const dbModule = require("../db/workbook-db.js");
    getWorkbookDb = dbModule.getWorkbookDb;
  } catch (err) {
    errors.push({
      file: "workbook-db",
      error: `Failed to load database module: ${err instanceof Error ? err.message : String(err)}`,
    });
    return { items, errors };
  }

  let db: import("bun:sqlite").Database;
  try {
    db = getWorkbookDb(rootPath);
  } catch (err) {
    // Database doesn't exist yet - that's ok, just return empty
    return { items, errors };
  }

  // Get all user tables
  const tables = db.query<{ name: string }, []>(`
    SELECT name FROM sqlite_master
    WHERE type = 'table'
      AND name NOT LIKE 'sqlite_%'
      AND name NOT GLOB '__*'
    ORDER BY name
  `).all();

  const allTableNames = tables.map((t) => t.name);

  // First pass: collect all table schemas and foreign keys
  const tableSchemas = new Map<
    string,
    { columns: DomainColumn[]; foreignKeys: DomainForeignKey[] }
  >();

  for (const table of tables) {
    try {
      // Get columns
      const columnsRaw = db.query<{
        name: string;
        type: string;
        notnull: number;
        pk: number;
        dflt_value: string | null;
      }, []>(`PRAGMA table_info("${table.name}")`).all();

      const columns: DomainColumn[] = columnsRaw.map((c) => ({
        name: c.name,
        type: c.type,
        nullable: c.notnull === 0,
        isPrimary: c.pk === 1,
        defaultValue: c.dflt_value ?? undefined,
      }));

      // Get foreign keys
      const fksRaw = db.query<{
        from: string;
        table: string;
        to: string;
      }, []>(`PRAGMA foreign_key_list("${table.name}")`).all();

      const foreignKeys: DomainForeignKey[] = fksRaw.map((fk) => ({
        column: fk.from,
        referencedTable: fk.table,
        referencedColumn: fk.to,
      }));

      tableSchemas.set(table.name, { columns, foreignKeys });
    } catch (err) {
      errors.push({
        file: table.name,
        error: `Failed to get schema: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  // Second pass: filter relation tables and build domains
  for (const table of tables) {
    const schema = tableSchemas.get(table.name);
    if (!schema) continue;

    // Check if this is a relation table
    const relationCheck = detectRelationTable(
      table.name,
      schema.columns,
      schema.foreignKeys,
      allTableNames
    );

    if (relationCheck.isRelation) {
      continue; // Skip relation tables
    }

    // Find related domains (tables that have FKs pointing to this table)
    const relatedDomains: string[] = [];
    for (const [otherTable, otherSchema] of tableSchemas) {
      if (otherTable === table.name) continue;

      // Check if other table has FK pointing to this table
      if (otherSchema.foreignKeys.some((fk) => fk.referencedTable === table.name)) {
        relatedDomains.push(otherTable);
      }
    }

    // Also add tables this domain references
    for (const fk of schema.foreignKeys) {
      if (!relatedDomains.includes(fk.referencedTable)) {
        relatedDomains.push(fk.referencedTable);
      }
    }

    // Generate schema hash
    const schemaHash = generateSchemaHash(
      table.name,
      schema.columns,
      schema.foreignKeys
    );

    // Find matching page
    const matchedPage = findMatchingPage(table.name, pages);

    // Create domain
    const domain: DiscoveredDomain = {
      id: table.name,
      name: toDisplayName(table.name),
      columns: schema.columns,
      schemaHash,
      foreignKeys: schema.foreignKeys,
      relatedDomains,
      hasPage: !!matchedPage,
      pagePath: matchedPage?.path,
      pageId: matchedPage?.id,
      syncStatus: {
        isSynced: !matchedPage, // If no page, consider it synced (nothing to sync)
        currentHash: schemaHash,
        pageHash: undefined, // TODO: read from page frontmatter
      },
    };

    items.push(domain);
  }

  return { items, errors };
}

/**
 * Find a page that matches a domain by table name.
 */
function findMatchingPage(
  tableName: string,
  pages: DiscoveredPage[]
): { path: string; id: string } | null {
  // Normalize table name for comparison
  const normalizedTable = tableName.toLowerCase();

  // Try to match by page route/id
  for (const page of pages) {
    // Skip block pages
    if (page.isBlock) continue;

    // Get page ID from route (e.g., "/products" -> "products")
    const pageId = page.route.replace(/^\//, "").replace(/\//g, "-") || "index";
    const normalizedPageId = pageId.toLowerCase().replace(/-/g, "_");

    // Match by page ID
    if (normalizedPageId === normalizedTable) {
      return { path: page.path, id: pageId };
    }

    // Also try matching by filename
    const filename = basename(page.path, page.ext).toLowerCase().replace(/-/g, "_");
    if (filename === normalizedTable) {
      return { path: page.path, id: pageId };
    }
  }

  return null;
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
 *
 * NOTE: This only lists files - it does NOT import them.
 * Actual module loading happens through runtime's Vite pipeline.
 * Full metadata (name, description, etc.) comes from runtime's /actions endpoint.
 */
function discoverActionFile(
  actionPath: string,
  actionId: string,
  rootPath: string
): DiscoveredAction | null {
  if (!existsSync(actionPath)) {
    return null;
  }

  const basePath = relative(rootPath, actionPath);

  // Just return file info - don't import the module
  // Runtime will load it through Vite for proper alias resolution
  return {
    id: actionId,
    path: basePath,
    valid: true, // Assume valid until runtime proves otherwise
    name: actionId, // Placeholder - runtime provides real name
    triggers: ["manual"], // Default - runtime provides real triggers
  };
}

/**
 * Discover all actions in the actions directory.
 *
 * Directory structure:
 * - actions/<name>.ts (single file actions)
 * - actions/<name>/action.ts (folder-based actions)
 */
export function discoverActions(
  actionsDir: string,
  rootPath: string
): DiscoveryResult<DiscoveredAction> {
  const items: DiscoveredAction[] = [];
  const errors: DiscoveryError[] = [];

  if (!existsSync(actionsDir)) {
    return { items, errors };
  }

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
        const action = discoverActionFile(join(entryPath, "action.ts"), entry, rootPath);
        if (action) items.push(action);
      } else if (entry.endsWith(".ts") && !entry.endsWith(".d.ts")) {
        // Single file action: actions/<name>.ts
        const actionId = basename(entry, ".ts");
        const action = discoverActionFile(entryPath, actionId, rootPath);
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

  // Discover blocks
  const blocksResult = await discoverBlocks(resolved.pagesDir);

  // Discover actions
  const actionsResult = discoverActions(resolved.actionsDir, resolved.rootPath);

  return {
    blocks: blocksResult.items,
    actions: actionsResult.items,
    errors: [
      ...blocksResult.errors,
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
