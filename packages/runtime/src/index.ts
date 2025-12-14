#!/usr/bin/env bun

/**
 * Hands Runtime - Instant streaming dev server
 *
 * Usage:
 *   hands-runtime --workbook-id=<id> --workbook-dir=<dir> [--port=<port>]
 *   hands-runtime check <workbook-dir> [--json] [--strict]
 *
 * Architecture:
 *   1. Immediately starts HTTP server (manifest available instantly)
 *   2. Boots PGlite in background (data in workbook-dir/db/)
 *   3. Builds and starts Vite in background
 *   4. Progressive readiness - manifest first, then DB, then RSC
 */

import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, type FSWatcher, readdirSync, readFileSync, watch } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import type { SourceDefinitionV2 } from "@hands/stdlib/sources";
import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  discoverActions,
  initActionRunsTable,
  registerWebhookRoutes,
  startScheduler,
  stopScheduler,
} from "./actions/index.js";
import { buildRSC } from "./build/rsc.js";
import { getEditorSourcePath } from "./config/index.js";
import type { BlockContext } from "./ctx.js";
import { initWorkbookDb, type WorkbookDb } from "./db/index.js";
import { createPgTypedRunner, type PgTypedRunner } from "./db/pgtyped/index.js";
import { PORTS, waitForPortFree } from "./ports.js";
import { discoverSources } from "./sources/discovery.js";
import { registerSourceRoutes } from "./sources/index.js";
import { registerTRPCRoutes } from "./trpc/index.js";
import { PageRegistry, createPageRegistry, renderPage, type PageRenderContext } from "./pages/index.js";
import {
  initThumbnailsTable,
  getThumbnail,
  getThumbnails,
  saveThumbnail,
  deleteThumbnails,
  type ThumbnailInput,
} from "./thumbnails/index.js";

interface RuntimeConfig {
  workbookId: string;
  workbookDir: string;
  port: number;
  noEditor?: boolean;
}

interface RuntimeState {
  dbReady: boolean;
  viteReady: boolean;
  vitePort: number | null;
  editorReady: boolean;
  editorPort: number | null;
  editorProc: ChildProcess | null;
  editorRestartCount: number;
  editorReadyPromise: Promise<void> | null;
  editorReadyResolve: (() => void) | null;
  editorConfig: RuntimeConfig | null;
  workbookDb: WorkbookDb | null;
  viteProc: ChildProcess | null;
  fileWatchers: FSWatcher[];
  buildErrors: string[];
  viteError: string | null;
  pgTypedRunner: PgTypedRunner | null;
  pageRegistry: PageRegistry | null;
}

// Global state for progressive readiness
const state: RuntimeState = {
  dbReady: false,
  viteReady: false,
  vitePort: null,
  editorReady: false,
  editorPort: null,
  editorProc: null,
  editorRestartCount: 0,
  editorReadyPromise: null,
  editorReadyResolve: null,
  editorConfig: null,
  workbookDb: null,
  viteProc: null,
  buildErrors: [],
  viteError: null,
  fileWatchers: [],
  pgTypedRunner: null,
  pageRegistry: null,
};

// Max restarts before giving up
const MAX_EDITOR_RESTARTS = 3;

/**
 * Format a block source file with Biome + TypeScript import organization
 * Runs silently - errors are logged but don't fail the operation
 */
async function formatBlockSource(filePath: string, workbookDir: string): Promise<boolean> {
  try {
    const blocksDir = join(workbookDir, "blocks");

    // Step 1: TypeScript import organization via ts-morph
    const { Project } = await import("ts-morph");
    const tsconfigPath = join(workbookDir, "tsconfig.json");
    let project: InstanceType<typeof Project>;

    if (existsSync(tsconfigPath)) {
      project = new Project({ tsConfigFilePath: tsconfigPath });
    } else {
      project = new Project({ useInMemoryFileSystem: false });
      project.addSourceFilesAtPaths(join(blocksDir, "**/*.{ts,tsx}"));
    }

    const sourceFile = project.getSourceFile(filePath);
    if (sourceFile) {
      sourceFile.organizeImports();
      await sourceFile.save();
    }

    // Step 2: Biome format + lint fixes
    const { spawnSync } = await import("node:child_process");
    const biomePath = join(workbookDir, "node_modules", ".bin", "biome");
    const globalBiomePath = join(import.meta.dirname, "..", "node_modules", ".bin", "biome");
    const biomeCmd = existsSync(biomePath) ? biomePath : globalBiomePath;

    // Ensure biome config exists
    const biomeConfigPath = join(workbookDir, "biome.json");
    if (!existsSync(biomeConfigPath)) {
      const { writeFileSync } = await import("node:fs");
      writeFileSync(
        biomeConfigPath,
        JSON.stringify(
          {
            $schema: "https://biomejs.dev/schemas/1.9.4/schema.json",
            organizeImports: { enabled: true },
            linter: { enabled: true },
            formatter: { enabled: true, indentStyle: "space", indentWidth: 2 },
            javascript: { formatter: { semicolons: "asNeeded", quoteStyle: "single" } },
          },
          null,
          2,
        ),
      );
    }

    spawnSync(biomeCmd, ["check", "--write", filePath], { cwd: workbookDir });
    return true;
  } catch (err) {
    console.error("[runtime] Format failed:", err);
    return false;
  }
}

// Parse CLI args
function parseArgs(): RuntimeConfig {
  const args: Record<string, string> = {};

  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--")) {
      const [key, value] = arg.slice(2).split("=");
      args[key.replace(/-/g, "_")] = value;
    }
  }

  if (!args.workbook_id || !args.workbook_dir) {
    console.error(
      "Usage: hands-runtime --workbook-id=<id> --workbook-dir=<dir> [--port=<port>] [--no-editor]",
    );
    process.exit(1);
  }

  return {
    workbookId: args.workbook_id,
    workbookDir: args.workbook_dir,
    port: args.port ? parseInt(args.port, 10) : PORTS.RUNTIME,
    noEditor: "no_editor" in args,
  };
}

/** Source info for manifest */
interface ManifestSource {
  id: string;
  name: string;
  title: string;
  description: string;
  schedule?: string;
  secrets: string[];
  missingSecrets: string[];
  path: string;
  /** Markdown spec describing the source's intent and behavior */
  spec?: string;
}

/**
 * Build manifest from filesystem (no DB needed - instant!)
 * Single file walk discovers blocks and sources.
 */
async function getManifest(workbookDir: string, workbookId: string) {
  const blocks: Array<{
    id: string;
    title: string;
    path: string;
    parentDir: string;
    uninitialized?: boolean;
  }> = [];
  const sources: ManifestSource[] = [];

  // Read blocks from filesystem (recursive walk)
  const blocksDir = join(workbookDir, "blocks");
  if (existsSync(blocksDir)) {
    walkDirectory(blocksDir, blocksDir, (filePath, relativePath) => {
      const filename = filePath.split("/").pop() || "";
      if ((filename.endsWith(".tsx") || filename.endsWith(".ts")) && !filename.startsWith("_")) {
        // ID is relative path without extension (e.g., "ui/email-events")
        const id = relativePath.replace(/\.tsx?$/, "");
        // parentDir is the directory portion (e.g., "ui" or "" for root)
        const parentDir = relativePath.includes("/")
          ? relativePath.substring(0, relativePath.lastIndexOf("/"))
          : "";
        // Extract title from meta export
        const content = readFileSync(filePath, "utf-8");
        const title = extractBlockTitle(content) || id.split("/").pop() || id;
        // Check if block has the uninitialized marker (fast string check)
        const uninitialized = content.includes("@hands:uninitialized");
        blocks.push({
          id,
          title,
          path: relativePath,
          parentDir,
          uninitialized: uninitialized || undefined,
        });
      }
    });
  }

  // Read sources from filesystem - scan sources/ for directories with source.ts (v2)
  const sourcesDir = join(workbookDir, "sources");
  if (existsSync(sourcesDir)) {
    const entries = readdirSync(sourcesDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      // Look for source.ts (v2 format)
      const sourceDir = join(sourcesDir, entry.name);
      const sourcePath = join(sourceDir, "source.ts");

      if (!existsSync(sourcePath)) continue;

      try {
        // Dynamic import - Bun will handle TypeScript
        const mod = await import(sourcePath);
        const definition = mod.default as SourceDefinitionV2 | undefined;

        // Validate it's a proper v2 source definition
        if (definition?.name) {
          sources.push({
            id: entry.name,
            name: definition.name,
            title: definition.name,
            description: definition.description ?? "",
            schedule: undefined,
            secrets: [],
            missingSecrets: [],
            path: sourcePath,
            spec: undefined,
          });
        }
      } catch (err) {
        console.error(`[manifest] Failed to load source ${entry.name}:`, err);
      }
    }
  }

  // Read config
  let config: Record<string, any> = {};
  const handsJsonPath = join(workbookDir, "hands.json");
  if (existsSync(handsJsonPath)) {
    try {
      config = JSON.parse(readFileSync(handsJsonPath, "utf-8"));
    } catch {}
  }

  // Discover actions
  const actionsDir = join(workbookDir, "actions");
  const actions: Array<{
    id: string;
    name: string;
    description?: string;
    schedule?: string;
    triggers: string[];
    path: string;
  }> = [];

  if (existsSync(actionsDir)) {
    try {
      const discoveredActions = await discoverActions(workbookDir);
      for (const action of discoveredActions) {
        actions.push({
          id: action.id,
          name: action.definition.name,
          description: action.definition.description,
          schedule: action.definition.schedule,
          triggers: action.definition.triggers ?? ["manual"],
          path: action.path,
        });
      }
    } catch (err) {
      console.error("[manifest] Failed to discover actions:", err);
    }
  }

  return {
    workbookId,
    workbookDir,
    blocks,
    sources,
    actions,
    config,
    isEmpty: blocks.length === 0 && sources.length === 0 && actions.length === 0,
  };
}

/**
 * Recursively walk a directory and call callback for each file
 */
function walkDirectory(
  dir: string,
  baseDir: string,
  callback: (filePath: string, relativePath: string) => void,
) {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    const relativePath = fullPath.substring(baseDir.length + 1); // +1 for leading slash
    if (entry.isDirectory()) {
      // Skip hidden directories and node_modules
      if (!entry.name.startsWith(".") && entry.name !== "node_modules") {
        walkDirectory(fullPath, baseDir, callback);
      }
    } else {
      callback(fullPath, relativePath);
    }
  }
}

function extractBlockTitle(content: string): string | null {
  // Look for: export const meta = { title: "..." }
  const metaMatch = content.match(
    /export\s+const\s+meta\s*=\s*{[\s\S]*?title\s*:\s*["']([^"']+)["']/,
  );
  if (metaMatch) return metaMatch[1];
  return null;
}

/**
 * Generate default block source code
 */
function generateDefaultBlockSource(blockId: string): string {
  // Convert blockId to PascalCase for function name
  const functionName = blockId
    .split(/[-_]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join("");

  return `import type { BlockFn, BlockMeta } from "@hands/stdlib"

const ${functionName}: BlockFn = async ({ ctx }) => {
  // Query your data here
  // const data = await ctx.sql\`SELECT * FROM your_table\`

  return (
    <div>
      <h2>${functionName}</h2>
      <p>Edit this block to add your content</p>
    </div>
  )
}

export default ${functionName}

export const meta: BlockMeta = {
  title: "${blockId}",
  description: "A new block",
  refreshable: true,
}
`;
}

/**
 * Get list of block IDs from filesystem
 */
function getBlockIds(blocksDir: string): Set<string> {
  const blockIds = new Set<string>();
  if (!existsSync(blocksDir)) return blockIds;

  walkDirectory(blocksDir, blocksDir, (filePath, relativePath) => {
    const filename = filePath.split("/").pop() || "";
    if ((filename.endsWith(".tsx") || filename.endsWith(".ts")) && !filename.startsWith("_")) {
      // ID is relative path without extension (e.g., "ui/email-events")
      const id = relativePath.replace(/\.tsx?$/, "");
      blockIds.add(id);
    }
  });

  return blockIds;
}

// Track known block IDs for restart detection
let knownBlockIds: Set<string> = new Set();

/**
 * Restart Vite worker when block list changes
 * This is necessary because blocks are statically imported - see worker-template.ts
 */
async function restartViteWorker(config: RuntimeConfig) {
  console.log("[runtime] Block list changed, restarting Vite worker...");

  // Kill existing Vite process
  if (state.viteProc) {
    state.viteProc.kill();
    state.viteProc = null;
    state.viteReady = false;
    state.vitePort = null;
  }

  // Rebuild and restart Vite (this regenerates worker.tsx with new static imports)
  await bootVite(config);
}

/**
 * Start watching blocks/ directory for changes
 * Uses fs.watch for real-time updates (not polling)
 * - Triggers pgtyped type generation on .ts/.tsx file changes
 * - Restarts Vite when blocks are added/removed (static imports require rebuild)
 * - Edits to existing blocks use Vite's HMR (no restart needed)
 */
function startFileWatcher(config: RuntimeConfig) {
  const { workbookDir } = config;
  const blocksDir = join(workbookDir, "blocks");

  // Initialize known block IDs
  knownBlockIds = getBlockIds(blocksDir);
  console.log(`[runtime] Initial blocks: ${[...knownBlockIds].join(", ") || "(none)"}`);

  // Watch blocks directory
  if (existsSync(blocksDir)) {
    try {
      const watcher = watch(blocksDir, { recursive: true }, async (_event, filename) => {
        if (filename && (filename.endsWith(".ts") || filename.endsWith(".tsx"))) {
          // Skip .types.ts files to avoid infinite loops
          if (filename.endsWith(".types.ts")) return;

          console.log(`[runtime] Block file event: ${filename}`);

          // Check if block list changed (add/remove)
          const currentBlockIds = getBlockIds(blocksDir);
          const added = [...currentBlockIds].filter((id) => !knownBlockIds.has(id));
          const removed = [...knownBlockIds].filter((id) => !currentBlockIds.has(id));

          if (added.length > 0 || removed.length > 0) {
            if (added.length > 0) console.log(`[runtime] Blocks added: ${added.join(", ")}`);
            if (removed.length > 0) console.log(`[runtime] Blocks removed: ${removed.join(", ")}`);

            // Update known blocks
            knownBlockIds = currentBlockIds;

            // Restart Vite to pick up new static imports
            await restartViteWorker(config);
          } else {
            // Just a file edit - pgtyped only, Vite handles HMR
            if (state.pgTypedRunner && state.dbReady) {
              const filePath = join(blocksDir, filename);
              if (existsSync(filePath)) {
                try {
                  await state.pgTypedRunner.runFile(filePath);
                } catch (err) {
                  console.warn(`[runtime] pgtyped failed for ${filename}:`, err);
                }
              }
            }
          }
        }
      });
      state.fileWatchers.push(watcher);
      console.log("[runtime] Watching blocks/ for changes (restarts Vite on add/remove)");
    } catch (err) {
      console.warn("[runtime] Could not watch blocks/:", err);
    }
  }

  // Watch pages directory
  const pagesDir = join(workbookDir, "pages");
  if (existsSync(pagesDir)) {
    try {
      const pagesWatcher = watch(pagesDir, { recursive: true }, async (_event, filename) => {
        if (filename && (filename.endsWith(".md") || filename.endsWith(".mdx") || filename.endsWith(".plate.json"))) {
          console.log(`[runtime] Page file event: ${filename}`);

          // Reload page registry to pick up changes
          if (state.pageRegistry) {
            try {
              await state.pageRegistry.load();
              console.log("[runtime] Page registry reloaded");
            } catch (err) {
              console.warn("[runtime] Failed to reload page registry:", err);
            }
          }
        }
      });
      state.fileWatchers.push(pagesWatcher);
      console.log("[runtime] Watching pages/ for changes");
    } catch (err) {
      console.warn("[runtime] Could not watch pages/:", err);
    }
  }
}

/**
 * Check if a SQL query is DDL (schema-changing)
 */
function isDDL(sql: string): boolean {
  const normalized = sql.trim().toUpperCase();
  return (
    normalized.startsWith("CREATE ") ||
    normalized.startsWith("ALTER ") ||
    normalized.startsWith("DROP ") ||
    normalized.startsWith("TRUNCATE ")
  );
}

/**
 * Create the Hono app for instant serving
 */
function createApp(config: RuntimeConfig) {
  const app = new Hono();

  // CORS
  app.use("/*", cors());

  // Health - simple ready/booting status
  // Single process architecture: ready when both DB and Vite are up
  app.get("/health", (c) => {
    const ready = state.dbReady && state.viteReady;
    return c.json({
      ready,
      status: ready ? "ready" : "booting", // backward compat
    });
  });

  // Status
  app.get("/status", (c) => {
    return c.json({
      workbookId: config.workbookId,
      workbookDir: config.workbookDir,
      services: {
        db: { ready: state.dbReady },
        blockServer: { ready: state.viteReady, port: state.vitePort, error: state.viteError },
        editor: {
          ready: state.editorReady,
          port: state.editorPort,
          restartCount: state.editorRestartCount,
        },
      },
      buildErrors: state.buildErrors,
    });
  });

  // Eval - returns diagnostic info for AlertsPanel
  // Simplified version (no tsc/biome) - just service status
  app.post("/eval", (c) => {
    return c.json({
      timestamp: Date.now(),
      duration: 0,
      wrangler: null,
      typescript: { errors: [], warnings: [] },
      format: { fixed: [], errors: [] },
      unused: { exports: [], files: [] },
      services: {
        postgres: {
          up: state.dbReady,
          port: 0, // PGlite is in-process, no TCP port
          error: state.dbReady ? undefined : "Database is booting",
        },
        blockServer: {
          up: state.viteReady,
          port: state.vitePort ?? 0,
          error: state.viteReady ? undefined : state.viteError || "Block server is starting",
        },
      },
    });
  });

  // Manifest - reads from filesystem only
  // Clients poll this endpoint (every 1s) instead of using SSE
  app.get("/workbook/manifest", async (c) => {
    const manifest = await getManifest(config.workbookDir, config.workbookId);

    // Include pages from pageRegistry with frontmatter titles
    const pages: Array<{ id: string; route: string; path: string; title: string }> = [];
    if (state.pageRegistry) {
      for (const p of state.pageRegistry.list()) {
        const compiled = await state.pageRegistry.getCompiled(p.route);
        const frontmatterTitle = compiled?.meta?.title;
        const id = p.path.replace(/\.(mdx?|plate\.json)$/, "");
        pages.push({
          id,
          route: p.route,
          path: p.path,
          // Use frontmatter title, fallback to "Untitled" for empty, or route-based name
          title: frontmatterTitle || (id.startsWith("untitled") ? "Untitled" : (p.route === "/" ? "Home" : p.route.slice(1))),
        });
      }
    }

    return c.json({
      ...manifest,
      pages,
      isEmpty: manifest.isEmpty && pages.length === 0,
    });
  });

  // ============================================
  // Block Source API - for visual block editor
  // Supports nested paths like "ui/email-events"
  // ============================================

  // Get block source code
  // Use :blockId{.+} to support nested paths: /workbook/blocks/ui/email-events/source
  app.get("/workbook/blocks/:blockId{.+}/source", async (c) => {
    const blockId = c.req.param("blockId");
    const blocksDir = join(config.workbookDir, "blocks");

    for (const ext of [".tsx", ".ts"]) {
      const filePath = join(blocksDir, blockId + ext);
      if (existsSync(filePath)) {
        const source = readFileSync(filePath, "utf-8");
        return c.json({
          success: true,
          blockId,
          filePath,
          source,
        });
      }
    }

    return c.json({ error: "Block not found" }, 404);
  });

  // Save block source code
  // Use :blockId{.+} to support nested paths: /workbook/blocks/ui/email-events/source
  app.put("/workbook/blocks/:blockId{.+}/source", async (c) => {
    const blockId = c.req.param("blockId");
    const blocksDir = join(config.workbookDir, "blocks");
    const { source } = await c.req.json<{ source: string }>();

    if (!source || typeof source !== "string") {
      return c.json({ error: "Missing source in request body" }, 400);
    }

    // Find existing file or use .tsx for new files
    let filePath: string | null = null;
    for (const ext of [".tsx", ".ts"]) {
      const path = join(blocksDir, blockId + ext);
      if (existsSync(path)) {
        filePath = path;
        break;
      }
    }

    // Default to .tsx for new blocks
    if (!filePath) {
      filePath = join(blocksDir, `${blockId}.tsx`);
    }

    try {
      // Write the source with fsync to ensure it's flushed to disk
      const { mkdirSync, readFileSync, openSync, writeSync, fsyncSync, closeSync } = await import(
        "node:fs"
      );

      // Ensure parent directories exist (for nested blocks like ui/email-events)
      const parentDir = filePath.substring(0, filePath.lastIndexOf("/"));
      if (!existsSync(parentDir)) {
        mkdirSync(parentDir, { recursive: true });
      }

      // Write with explicit fsync to guarantee file is flushed to disk
      // This prevents race conditions where Vite reads before write completes
      const fd = openSync(filePath, "w");
      writeSync(fd, source, 0, "utf-8");
      fsyncSync(fd);
      closeSync(fd);

      // Auto-format after save (non-blocking, errors don't fail the save)
      await formatBlockSource(filePath, config.workbookDir);

      // Read back the formatted source
      const formattedSource = readFileSync(filePath, "utf-8");

      return c.json({
        success: true,
        blockId,
        filePath,
        source: formattedSource,
      });
    } catch (err) {
      return c.json(
        {
          error: `Failed to write block: ${err instanceof Error ? err.message : String(err)}`,
        },
        500,
      );
    }
  });

  // Create new block
  // Supports nested paths like "ui/email-events"
  app.post("/workbook/blocks", async (c) => {
    const { blockId, source } = await c.req.json<{ blockId: string; source?: string }>();

    if (!blockId || typeof blockId !== "string") {
      return c.json({ error: "Missing blockId" }, 400);
    }

    // Validate block ID - allow paths with slashes, each segment must be valid
    // e.g., "ui/email-events" or "charts/sales/monthly"
    const segments = blockId.split("/");
    for (const segment of segments) {
      if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(segment)) {
        return c.json(
          {
            error:
              "Invalid blockId - each path segment must start with letter, contain only alphanumeric, dashes, underscores",
          },
          400,
        );
      }
    }

    const blocksDir = join(config.workbookDir, "blocks");
    const filePath = join(blocksDir, `${blockId}.tsx`);

    // Check if already exists
    if (existsSync(filePath)) {
      return c.json({ error: "Block already exists" }, 409);
    }

    // Generate default source if not provided (use last segment for function name)
    const blockName = segments[segments.length - 1];
    const defaultSource = source ?? generateDefaultBlockSource(blockName);

    try {
      const { writeFileSync, mkdirSync } = await import("node:fs");

      // Ensure parent directories exist (for nested blocks)
      const parentDir = filePath.substring(0, filePath.lastIndexOf("/"));
      if (!existsSync(parentDir)) {
        mkdirSync(parentDir, { recursive: true });
      }

      writeFileSync(filePath, defaultSource, "utf-8");

      return c.json(
        {
          success: true,
          blockId,
          filePath,
        },
        201,
      );
    } catch (err) {
      return c.json(
        {
          error: `Failed to create block: ${err instanceof Error ? err.message : String(err)}`,
        },
        500,
      );
    }
  });

  // Delete block
  // Use :blockId{.+} to support nested paths: /workbook/blocks/ui/email-events
  app.delete("/workbook/blocks/:blockId{.+}", async (c) => {
    const blockId = c.req.param("blockId");
    const blocksDir = join(config.workbookDir, "blocks");

    let deleted = false;
    for (const ext of [".tsx", ".ts"]) {
      const filePath = join(blocksDir, blockId + ext);
      if (existsSync(filePath)) {
        const { unlinkSync } = await import("node:fs");
        unlinkSync(filePath);
        deleted = true;
        break;
      }
    }

    if (!deleted) {
      return c.json({ error: "Block not found" }, 404);
    }

    return c.json({ success: true, blockId });
  });

  // Move/rename block with automatic import updates
  app.post("/workbook/blocks/move", async (c) => {
    const { from, to } = await c.req.json<{ from: string; to: string }>();

    if (!from || !to) {
      return c.json({ error: "Missing 'from' or 'to' in request body" }, 400);
    }

    const blocksDir = join(config.workbookDir, "blocks");

    // Find source file
    let sourceExt: string | null = null;
    for (const ext of [".tsx", ".ts"]) {
      if (existsSync(join(blocksDir, from + ext))) {
        sourceExt = ext;
        break;
      }
    }

    if (!sourceExt) {
      return c.json({ error: `Block not found: ${from}` }, 404);
    }

    const sourcePath = join(blocksDir, from + sourceExt);
    const targetPath = join(blocksDir, to + sourceExt);

    // Check target doesn't already exist
    if (existsSync(targetPath)) {
      return c.json({ error: `Target already exists: ${to}` }, 409);
    }

    try {
      // Use ts-morph to move file and update all imports
      const { Project } = await import("ts-morph");

      // Check for tsconfig, create minimal one if missing
      const tsconfigPath = join(config.workbookDir, "tsconfig.json");
      let project: InstanceType<typeof Project>;

      if (existsSync(tsconfigPath)) {
        project = new Project({ tsConfigFilePath: tsconfigPath });
      } else {
        // Create project without tsconfig, manually add source files
        project = new Project({ useInMemoryFileSystem: false });
        // Add all ts/tsx files in blocks directory
        project.addSourceFilesAtPaths(join(blocksDir, "**/*.{ts,tsx}"));
      }

      const sourceFile = project.getSourceFile(sourcePath);
      if (!sourceFile) {
        return c.json({ error: "Could not parse source file" }, 500);
      }

      // Ensure target directory exists
      const { mkdirSync } = await import("node:fs");
      const targetDir = targetPath.substring(0, targetPath.lastIndexOf("/"));
      if (!existsSync(targetDir)) {
        mkdirSync(targetDir, { recursive: true });
      }

      // Move file - ts-morph updates all imports automatically
      sourceFile.move(targetPath);

      // Save all changes
      await project.save();

      return c.json({
        success: true,
        from,
        to,
        message: "Block moved and imports updated",
      });
    } catch (err) {
      return c.json(
        {
          error: `Failed to move block: ${err instanceof Error ? err.message : String(err)}`,
        },
        500,
      );
    }
  });

  // Format block source with Biome + TypeScript fixes
  // POST /workbook/blocks/:blockId/fmt
  app.post("/workbook/blocks/:blockId{.+}/fmt", async (c) => {
    const blockId = c.req.param("blockId");
    const blocksDir = join(config.workbookDir, "blocks");

    // Find block file
    let filePath: string | null = null;
    for (const ext of [".tsx", ".ts"]) {
      const path = join(blocksDir, blockId + ext);
      if (existsSync(path)) {
        filePath = path;
        break;
      }
    }

    if (!filePath) {
      return c.json({ success: false }, 404);
    }

    const success = await formatBlockSource(filePath, config.workbookDir);
    return c.json({ success });
  });

  // ============================================
  // Page (MDX) Routes - for MDX editor testing
  // ============================================

  // List all pages
  app.get("/workbook/pages", async (c) => {
    if (!state.pageRegistry) {
      return c.json({ pages: [], errors: [], message: "Page registry not initialized" });
    }

    return c.json({
      pages: state.pageRegistry.list(),
      routes: state.pageRegistry.routes(),
      errors: state.pageRegistry.getErrors(),
    });
  });

  // Get page source code
  app.get("/workbook/pages/:path{.+}/source", async (c) => {
    if (!state.pageRegistry) {
      return c.json({ error: "Page registry not initialized" }, 503);
    }

    const pagePath = c.req.param("path");
    const route = pagePath.startsWith("/") ? pagePath : `/${pagePath}`;
    const page = state.pageRegistry.match(route);

    if (!page) {
      return c.json({ error: `Page not found: ${route}` }, 404);
    }

    const source = await state.pageRegistry.getSource(page.route);
    if (!source) {
      return c.json({ error: "Failed to read page source" }, 500);
    }

    return c.json({
      success: true,
      route: page.route,
      path: page.path,
      source,
    });
  });

  // Save page source code
  app.put("/workbook/pages/:path{.+}/source", async (c) => {
    if (!state.pageRegistry) {
      return c.json({ error: "Page registry not initialized" }, 503);
    }

    const pagePath = c.req.param("path");
    const route = pagePath.startsWith("/") ? pagePath : `/${pagePath}`;
    const { source } = await c.req.json<{ source: string }>();

    if (!source || typeof source !== "string") {
      return c.json({ error: "Missing source in request body" }, 400);
    }

    const page = state.pageRegistry.match(route);
    if (!page) {
      return c.json({ error: `Page not found: ${route}` }, 404);
    }

    // Write source to file
    const pagesDir = state.pageRegistry.getPagesDir();
    const filePath = join(pagesDir, page.path);

    try {
      const { openSync, writeSync, fsyncSync, closeSync } = await import("node:fs");
      const fd = openSync(filePath, "w");
      writeSync(fd, source, 0, "utf-8");
      fsyncSync(fd);
      closeSync(fd);

      // Invalidate cached compilation
      state.pageRegistry.invalidate(page.route);

      return c.json({
        success: true,
        route: page.route,
        path: page.path,
      });
    } catch (err) {
      return c.json(
        { error: `Failed to write page: ${err instanceof Error ? err.message : String(err)}` },
        500,
      );
    }
  });

  // Render a page (server-side)
  app.get("/pages/:path{.+}", async (c) => {
    if (!state.pageRegistry) {
      return c.html("<html><body><h1>Page registry not initialized</h1></body></html>", 503);
    }

    const pagePath = c.req.param("path");
    const route = pagePath.startsWith("/") ? pagePath : `/${pagePath}`;
    const page = state.pageRegistry.match(route);

    if (!page) {
      return c.html("<html><body><h1>Page not found</h1></body></html>", 404);
    }

    // Create render context
    const renderContext: PageRenderContext = {
      pagesDir: state.pageRegistry.getPagesDir(),
      blockServerPort: state.vitePort ?? undefined,
      useRsc: state.viteReady,
    };

    try {
      const result = await renderPage({
        pagePath: page.path,
        context: renderContext,
      });

      if (result.error) {
        console.warn(`[runtime] Page render warning: ${result.error}`);
      }

      return c.html(result.html);
    } catch (err) {
      console.error("[runtime] Page render failed:", err);
      return c.html(
        `<html><body><h1>Render Error</h1><pre>${err instanceof Error ? err.message : String(err)}</pre></body></html>`,
        500,
      );
    }
  });

  // Reload page registry
  app.post("/workbook/pages/reload", async (c) => {
    if (!state.pageRegistry) {
      return c.json({ error: "Page registry not initialized" }, 503);
    }

    try {
      const result = await state.pageRegistry.load();
      return c.json({
        success: true,
        pages: result.pages.length,
        errors: result.errors,
      });
    } catch (err) {
      return c.json(
        { error: `Failed to reload: ${err instanceof Error ? err.message : String(err)}` },
        500,
      );
    }
  });

  // Create new page - instant creation with auto-incrementing "untitled" name
  app.post("/workbook/pages", async (c) => {
    const pagesDir = join(config.workbookDir, "pages");

    // Create pages directory if it doesn't exist
    if (!existsSync(pagesDir)) {
      const { mkdirSync } = await import("node:fs");
      mkdirSync(pagesDir, { recursive: true });
    }

    // Find next available "untitled" name
    let pageId = "untitled";
    let counter = 0;
    while (existsSync(join(pagesDir, `${pageId}.mdx`))) {
      counter++;
      pageId = `untitled-${counter}`;
    }

    const filePath = join(pagesDir, `${pageId}.mdx`);

    // Default MDX content - empty title so user focuses on it
    const defaultSource = `---
title: ""
---

`;

    try {
      const { openSync, writeSync, fsyncSync, closeSync } = await import("node:fs");
      const fd = openSync(filePath, "w");
      writeSync(fd, defaultSource, 0, "utf-8");
      fsyncSync(fd);
      closeSync(fd);

      // Reload page registry to pick up the new page
      if (state.pageRegistry) {
        await state.pageRegistry.load();
      } else {
        // Initialize page registry if it doesn't exist
        state.pageRegistry = createPageRegistry({
          pagesDir,
          precompile: false,
        });
        await state.pageRegistry.load();
      }

      return c.json({
        success: true,
        pageId,
        filePath,
      });
    } catch (err) {
      return c.json(
        {
          error: `Failed to create page: ${err instanceof Error ? err.message : String(err)}`,
        },
        500,
      );
    }
  });

  // Rename page (triggered when title changes)
  app.post("/workbook/pages/:path{.+}/rename", async (c) => {
    if (!state.pageRegistry) {
      return c.json({ error: "Page registry not initialized" }, 503);
    }

    const pagePath = c.req.param("path");
    const route = pagePath.startsWith("/") ? pagePath : `/${pagePath}`;
    const { newSlug } = await c.req.json<{ newSlug: string }>();

    if (!newSlug || typeof newSlug !== "string") {
      return c.json({ error: "Missing newSlug" }, 400);
    }

    // Validate slug
    if (!/^[a-z0-9][a-z0-9-]*$/.test(newSlug)) {
      return c.json({ error: "Invalid slug - use lowercase, numbers, hyphens only" }, 400);
    }

    const page = state.pageRegistry.match(route);
    if (!page) {
      return c.json({ error: `Page not found: ${route}` }, 404);
    }

    const pagesDir = state.pageRegistry.getPagesDir();
    const oldFilePath = join(pagesDir, page.path);
    const newFileName = `${newSlug}${page.ext}`;
    const newFilePath = join(pagesDir, newFileName);

    // Check if target already exists (and isn't the same file)
    if (oldFilePath !== newFilePath && existsSync(newFilePath)) {
      return c.json({ error: `Page already exists: ${newSlug}` }, 409);
    }

    // Skip if same file
    if (oldFilePath === newFilePath) {
      return c.json({ success: true, newRoute: route, noChange: true });
    }

    try {
      const { renameSync } = await import("node:fs");
      renameSync(oldFilePath, newFilePath);

      // Reload page registry
      await state.pageRegistry.load();

      // Calculate new route
      const newRoute = newSlug === "index" ? "/" : `/${newSlug}`;

      return c.json({
        success: true,
        oldRoute: route,
        newRoute,
        newPath: newFileName,
      });
    } catch (err) {
      return c.json(
        { error: `Failed to rename: ${err instanceof Error ? err.message : String(err)}` },
        500,
      );
    }
  });

  // Delete a page
  app.delete("/workbook/pages/:path{.+}", async (c) => {
    if (!state.pageRegistry) {
      return c.json({ error: "Page registry not initialized" }, 503);
    }

    const pagePath = c.req.param("path");
    const route = pagePath.startsWith("/") ? pagePath : `/${pagePath}`;

    const page = state.pageRegistry.match(route);
    if (!page) {
      return c.json({ error: `Page not found: ${route}` }, 404);
    }

    const pagesDir = state.pageRegistry.getPagesDir();
    const filePath = join(pagesDir, page.path);

    try {
      const { unlinkSync } = await import("node:fs");
      unlinkSync(filePath);

      // Reload page registry
      await state.pageRegistry.load();

      return c.json({
        success: true,
        deletedRoute: route,
        deletedPath: page.path,
      });
    } catch (err) {
      return c.json(
        { error: `Failed to delete: ${err instanceof Error ? err.message : String(err)}` },
        500,
      );
    }
  });

  // Duplicate a page
  app.post("/workbook/pages/:path{.+}/duplicate", async (c) => {
    if (!state.pageRegistry) {
      return c.json({ error: "Page registry not initialized" }, 503);
    }

    const pagePath = c.req.param("path");
    const route = pagePath.startsWith("/") ? pagePath : `/${pagePath}`;

    const page = state.pageRegistry.match(route);
    if (!page) {
      return c.json({ error: `Page not found: ${route}` }, 404);
    }

    const pagesDir = state.pageRegistry.getPagesDir();
    const sourcePath = join(pagesDir, page.path);

    // Read original source
    const source = await state.pageRegistry.getSource(page.route);
    if (!source) {
      return c.json({ error: "Failed to read page source" }, 500);
    }

    // Generate unique name: original-copy, original-copy-1, etc.
    const baseName = page.path.replace(page.ext, "");
    let newName = `${baseName}-copy`;
    let counter = 0;
    while (existsSync(join(pagesDir, `${newName}${page.ext}`))) {
      counter++;
      newName = `${baseName}-copy-${counter}`;
    }

    const newPath = `${newName}${page.ext}`;
    const newFilePath = join(pagesDir, newPath);

    try {
      const { writeFileSync } = await import("node:fs");
      writeFileSync(newFilePath, source, "utf-8");

      // Reload page registry
      await state.pageRegistry.load();

      const newRoute = newName === "index" ? "/" : `/${newName}`;

      return c.json({
        success: true,
        originalRoute: route,
        newRoute,
        newPath,
      });
    } catch (err) {
      return c.json(
        { error: `Failed to duplicate: ${err instanceof Error ? err.message : String(err)}` },
        500,
      );
    }
  });

  // =========================================================================
  // Thumbnail routes - preview images for pages/blocks
  // =========================================================================

  // GET /workbook/thumbnails/:type/:id - Get thumbnails for a page/block (both themes)
  app.get("/workbook/thumbnails/:type/:id{.+}", async (c) => {
    if (!state.dbReady || !state.workbookDb) {
      return c.json({ error: "Database not ready" }, 503);
    }

    const type = c.req.param("type") as "page" | "block";
    const contentId = c.req.param("id");

    if (type !== "page" && type !== "block") {
      return c.json({ error: "Invalid type, must be 'page' or 'block'" }, 400);
    }

    try {
      const thumbnails = await getThumbnails(state.workbookDb.db, type, contentId);
      return c.json(thumbnails);
    } catch (err) {
      console.error("[thumbnails] Error fetching:", err);
      return c.json({ error: String(err) }, 500);
    }
  });

  // POST /workbook/thumbnails - Save a thumbnail
  app.post("/workbook/thumbnails", async (c) => {
    if (!state.dbReady || !state.workbookDb) {
      return c.json({ error: "Database not ready" }, 503);
    }

    try {
      const body = await c.req.json<ThumbnailInput>();

      if (!body.type || !body.contentId || !body.theme || !body.thumbnail || !body.lqip) {
        return c.json({ error: "Missing required fields" }, 400);
      }

      if (body.type !== "page" && body.type !== "block") {
        return c.json({ error: "Invalid type" }, 400);
      }

      if (body.theme !== "light" && body.theme !== "dark") {
        return c.json({ error: "Invalid theme" }, 400);
      }

      await saveThumbnail(state.workbookDb.db, body);
      return c.json({ success: true });
    } catch (err) {
      console.error("[thumbnails] Error saving:", err);
      return c.json({ error: String(err) }, 500);
    }
  });

  // DELETE /workbook/thumbnails/:type/:id - Delete thumbnails for a page/block
  app.delete("/workbook/thumbnails/:type/:id{.+}", async (c) => {
    if (!state.dbReady || !state.workbookDb) {
      return c.json({ error: "Database not ready" }, 503);
    }

    const type = c.req.param("type") as "page" | "block";
    const contentId = c.req.param("id");

    if (type !== "page" && type !== "block") {
      return c.json({ error: "Invalid type" }, 400);
    }

    try {
      await deleteThumbnails(state.workbookDb.db, type, contentId);
      return c.json({ success: true });
    } catch (err) {
      console.error("[thumbnails] Error deleting:", err);
      return c.json({ error: String(err) }, 500);
    }
  });

  // DB routes - require DB ready
  app.post("/db/query", async (c) => {
    if (!state.dbReady || !state.workbookDb) {
      return c.json({ error: "Database not ready", booting: true }, 503);
    }

    const { query } = await c.req.json<{ query: string }>();
    try {
      const result = await state.workbookDb.db.query(query);

      // Check if DDL - regenerate schema and pgtyped types
      if (isDDL(query)) {
        await state.workbookDb.regenerateSchema();
        if (state.pgTypedRunner) {
          await state.pgTypedRunner.refreshSchema();
          await state.pgTypedRunner.runAll();
        }
      }

      return c.json({ rows: result.rows, rowCount: result.rows.length });
    } catch (err) {
      return c.json({ error: String(err) }, 500);
    }
  });

  app.get("/db/tables", async (c) => {
    if (!state.dbReady || !state.workbookDb) {
      return c.json({ error: "Database not ready", booting: true }, 503);
    }

    try {
      const result = await state.workbookDb.db.query(`
        SELECT table_name as name
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        ORDER BY table_name
      `);
      return c.json(result.rows);
    } catch (err) {
      return c.json({ error: String(err) }, 500);
    }
  });

  // Backward-compatible /postgres/* routes for desktop app
  app.post("/postgres/query", async (c) => {
    if (!state.dbReady || !state.workbookDb) {
      return c.json({ error: "Database not ready", booting: true }, 503);
    }

    const { query } = await c.req.json<{ query: string }>();
    try {
      const result = await state.workbookDb.db.query(query);

      // Check if DDL - regenerate schema and pgtyped types
      if (isDDL(query)) {
        await state.workbookDb.regenerateSchema();
        if (state.pgTypedRunner) {
          await state.pgTypedRunner.refreshSchema();
          await state.pgTypedRunner.runAll();
        }
      }

      return c.json({ rows: result.rows, rowCount: result.rows.length });
    } catch (err) {
      return c.json({ error: String(err) }, 500);
    }
  });

  app.get("/postgres/tables", async (c) => {
    if (!state.dbReady || !state.workbookDb) {
      return c.json({ error: "Database not ready", booting: true }, 503);
    }

    try {
      const result = await state.workbookDb.db.query(`
        SELECT table_name as name
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        ORDER BY table_name
      `);
      return c.json(result.rows);
    } catch (err) {
      return c.json({ error: String(err) }, 500);
    }
  });

  app.get("/postgres/schema", async (c) => {
    if (!state.dbReady || !state.workbookDb) {
      return c.json({ error: "Database not ready", booting: true }, 503);
    }

    try {
      // Get columns for all public tables (excluding internal hands_admin tables)
      const result = await state.workbookDb.db.query(`
        SELECT
          t.table_name,
          c.column_name,
          c.data_type,
          c.is_nullable,
          c.column_default
        FROM information_schema.tables t
        JOIN information_schema.columns c
          ON t.table_name = c.table_name
          AND t.table_schema = c.table_schema
        WHERE t.table_schema = 'public'
          AND t.table_type = 'BASE TABLE'
        ORDER BY t.table_name, c.ordinal_position
      `);

      // Group by table for desktop app
      const tables: Record<
        string,
        { table_name: string; columns: { name: string; type: string; nullable: boolean }[] }
      > = {};
      for (const row of result.rows as Array<{
        table_name: string;
        column_name: string;
        data_type: string;
        is_nullable: string;
      }>) {
        if (!tables[row.table_name]) {
          tables[row.table_name] = { table_name: row.table_name, columns: [] };
        }
        tables[row.table_name].columns.push({
          name: row.column_name,
          type: row.data_type,
          nullable: row.is_nullable === "YES",
        });
      }

      return c.json(Object.values(tables));
    } catch (err) {
      return c.json({ error: String(err) }, 500);
    }
  });

  // Save workbook (dump DB to .hands/db.tar.gz)
  app.post("/db/save", async (c) => {
    if (!state.dbReady || !state.workbookDb) {
      return c.json({ error: "Database not ready", booting: true }, 503);
    }

    try {
      await state.workbookDb.save();
      return c.json({ success: true });
    } catch (err) {
      return c.json({ error: String(err) }, 500);
    }
  });

  // Get block context (for Vite server to use)
  app.get("/ctx", async (c) => {
    if (!state.dbReady || !state.workbookDb) {
      return c.json({ error: "Database not ready", booting: true }, 503);
    }
    // Context is ready - Vite will call this to check
    return c.json({ ready: true });
  });

  // Stop endpoint for graceful shutdown (used by Tauri)
  app.post("/stop", async (c) => {
    console.log("[runtime] Stop requested via /stop endpoint");
    // Trigger shutdown after responding
    setTimeout(() => process.exit(0), 100);
    return c.json({ success: true });
  });

  // ============================================
  // Source Management Routes
  // ============================================
  registerSourceRoutes(app, {
    workbookDir: config.workbookDir,
    isDbReady: () => state.dbReady,
    getDb: () => state.workbookDb?.db ?? null,
  });

  // ============================================
  // Action Webhook Routes
  // ============================================
  registerWebhookRoutes(app, {
    workbookDir: config.workbookDir,
    isDbReady: () => state.dbReady,
    getDb: () => state.workbookDb?.db ?? null,
    getSources: () => {
      // Discover sources synchronously from cache or return empty
      // The scheduler will have the latest sources
      return [];
    },
  });

  // ============================================
  // tRPC Routes (type-safe API)
  // ============================================
  registerTRPCRoutes(app, {
    workbookDir: config.workbookDir,
    getDb: () => state.workbookDb?.db ?? null,
    isDbReady: () => state.dbReady,
    saveDb: async () => {
      if (state.workbookDb) {
        await state.workbookDb.save();
      }
    },
  });

  // Serve client modules for RSC hydration
  // These are "use client" components that need to be loaded client-side
  // Path format: /client-modules/ui/counter-button.tsx -> blocks/ui/counter-button.tsx
  app.get("/client-modules/*", async (c) => {
    if (!state.viteReady || !state.vitePort) {
      const error = state.viteError || "Block server not ready";
      const booting = !state.viteError;
      return c.json({ error, booting, blockServerError: state.viteError }, 503);
    }

    // Extract the module path from the request
    const modulePath = c.req.path.replace("/client-modules", "");

    // Request this module from Vite using the fs prefix for absolute paths
    // Vite's dev server can serve files outside the root using /@fs/ prefix
    const blocksDir = join(config.workbookDir, "blocks");
    const absolutePath = join(blocksDir, modulePath);
    const viteUrl = `http://localhost:${state.vitePort}/@fs${absolutePath}`;

    try {
      const response = await fetch(viteUrl, {
        headers: {
          // Vite needs these headers to know we want ESM
          Accept: "application/javascript, */*",
        },
      });

      if (!response.ok) {
        console.error(`[runtime] Failed to fetch client module: ${viteUrl} -> ${response.status}`);
        return c.json({ error: `Module not found: ${modulePath}` }, 404);
      }

      // Get the module content as text so we can rewrite imports
      let content = await response.text();

      // Rewrite imports to be absolute URLs pointing to this runtime
      // This is necessary because the module will be loaded from a different origin (editor)
      const runtimeOrigin = `http://localhost:${config.port}`;

      // Rewrite Vite's special paths to go through our proxy
      // /@vite/client, /@react-refresh, /node_modules/.vite/deps/*, etc.
      // Include query strings like ?v=xxx
      content = content.replace(/from\s+["'](\/[^"']+)["']/g, (_match, path) => {
        return `from "${runtimeOrigin}/vite-proxy${path}"`;
      });
      content = content.replace(/import\s+["'](\/[^"']+)["']/g, (_match, path) => {
        return `import "${runtimeOrigin}/vite-proxy${path}"`;
      });
      // Also handle import() calls
      content = content.replace(/import\(["'](\/[^"']+)["']\)/g, (_match, path) => {
        return `import("${runtimeOrigin}/vite-proxy${path}")`;
      });

      // Return transformed JavaScript module
      const headers = new Headers();
      // Set correct content type for ES module
      headers.set("Content-Type", "application/javascript; charset=utf-8");
      // Allow CORS for cross-origin module loading
      headers.set("Access-Control-Allow-Origin", "*");

      return new Response(content, {
        status: response.status,
        headers,
      });
    } catch (err) {
      console.error(`[runtime] Client module proxy failed:`, err);
      return c.json({ error: `Module proxy failed: ${String(err)}` }, 502);
    }
  });

  // Proxy Vite internal routes for client module dependencies
  // Handles: /@vite/client, /@react-refresh, /node_modules/.vite/deps/*, /@fs/*
  app.get("/vite-proxy/*", async (c) => {
    if (!state.viteReady || !state.vitePort) {
      const error = state.viteError || "Block server not ready";
      const booting = !state.viteError;
      return c.json({ error, booting, blockServerError: state.viteError }, 503);
    }

    // Extract the path after /vite-proxy
    const vitePath = c.req.path.replace("/vite-proxy", "");

    // CRITICAL: Intercept React deps and return shims that use window.__HANDS_REACT__
    // This prevents "multiple React copies" errors when loading client components cross-origin.
    // The editor must expose window.__HANDS_REACT__ with { React, ReactDOM, ReactJSXRuntime }
    const reactShims: Record<string, string> = {
      // Main React export - re-export all from window.__HANDS_REACT__.React
      "react.js": `
const R = window.__HANDS_REACT__?.React;
if (!R) throw new Error("[hands-runtime] window.__HANDS_REACT__.React not found - editor must expose React");
export default R;
export const useState = R.useState;
export const useEffect = R.useEffect;
export const useCallback = R.useCallback;
export const useMemo = R.useMemo;
export const useRef = R.useRef;
export const useContext = R.useContext;
export const useReducer = R.useReducer;
export const useLayoutEffect = R.useLayoutEffect;
export const useImperativeHandle = R.useImperativeHandle;
export const useDebugValue = R.useDebugValue;
export const useDeferredValue = R.useDeferredValue;
export const useTransition = R.useTransition;
export const useId = R.useId;
export const useSyncExternalStore = R.useSyncExternalStore;
export const useInsertionEffect = R.useInsertionEffect;
export const createContext = R.createContext;
export const createElement = R.createElement;
export const cloneElement = R.cloneElement;
export const isValidElement = R.isValidElement;
export const Children = R.Children;
export const Fragment = R.Fragment;
export const StrictMode = R.StrictMode;
export const Suspense = R.Suspense;
export const lazy = R.lazy;
export const memo = R.memo;
export const forwardRef = R.forwardRef;
export const startTransition = R.startTransition;
export const Component = R.Component;
export const PureComponent = R.PureComponent;
export const createRef = R.createRef;
export const use = R.use;
export const useOptimistic = R.useOptimistic;
export const useActionState = R.useActionState;
export const cache = R.cache;
`,
      // react-dom
      "react-dom.js": `
const RD = window.__HANDS_REACT__?.ReactDOM;
if (!RD) throw new Error("[hands-runtime] window.__HANDS_REACT__.ReactDOM not found");
export default RD;
export const createRoot = RD.createRoot;
export const hydrateRoot = RD.hydrateRoot;
export const createPortal = RD.createPortal;
export const flushSync = RD.flushSync;
export const unstable_batchedUpdates = RD.unstable_batchedUpdates;
`,
      // JSX runtime
      "react_jsx-runtime.js": `
const JSX = window.__HANDS_REACT__?.ReactJSXRuntime;
if (!JSX) throw new Error("[hands-runtime] window.__HANDS_REACT__.ReactJSXRuntime not found");
export default JSX;
export const jsx = JSX.jsx;
export const jsxs = JSX.jsxs;
export const Fragment = JSX.Fragment;
`,
      // JSX dev runtime - uses ReactJSXDevRuntime which has jsxDEV
      "react_jsx-dev-runtime.js": `
const JSX = window.__HANDS_REACT__?.ReactJSXDevRuntime;
if (!JSX) throw new Error("[hands-runtime] window.__HANDS_REACT__.ReactJSXDevRuntime not found");
export default JSX;
export const jsx = JSX.jsx;
export const jsxs = JSX.jsxs;
export const jsxDEV = JSX.jsxDEV;
export const Fragment = JSX.Fragment;
`,
    };

    // Check if this is a React dep request
    const depMatch = vitePath.match(/\/node_modules\/\.vite\/deps\/(react[^?]*)/);
    if (depMatch) {
      const depName = depMatch[1];
      const shim = reactShims[depName];
      if (shim) {
        console.debug(`[runtime] Serving React shim for: ${depName}`);
        const headers = new Headers();
        headers.set("Content-Type", "application/javascript; charset=utf-8");
        headers.set("Access-Control-Allow-Origin", "*");
        headers.set("Cache-Control", "no-cache");
        return new Response(shim.trim(), { status: 200, headers });
      }
    }

    const viteUrl = `http://localhost:${state.vitePort}${vitePath}`;

    try {
      const response = await fetch(viteUrl, {
        headers: {
          Accept: "application/javascript, */*",
        },
      });

      if (!response.ok) {
        console.error(`[runtime] Failed to fetch vite dep: ${viteUrl} -> ${response.status}`);
        return c.json({ error: `Vite dependency not found: ${vitePath}` }, 404);
      }

      // Get the content as text to potentially rewrite nested imports
      let content = await response.text();

      // CRITICAL: If this chunk contains React or ReactDOM internals, replace with shim
      // to avoid "multiple copies of React" errors.
      if (vitePath.includes("chunk-")) {
        const isReactChunk =
          content.includes("node_modules/react/cjs/react.development.js") ||
          content.includes("node_modules/react/cjs/react.production");
        const isReactDOMChunk =
          content.includes("node_modules/react-dom/cjs/react-dom.development.js") ||
          content.includes("node_modules/react-dom/cjs/react-dom.production");

        if (isReactChunk) {
          console.debug(`[runtime] Detected React chunk, replacing with shim: ${vitePath}`);
          const shimContent = `
// Shim: React chunk -> window.__HANDS_REACT__
const R = window.__HANDS_REACT__?.React;
if (!R) throw new Error("[hands-runtime] React chunk requires window.__HANDS_REACT__");

// esbuild CJS interop - other chunks import require_react from this chunk
export function require_react() { return R; }

export { R as exports };
export default R;
export const useState = R.useState;
export const useEffect = R.useEffect;
export const useCallback = R.useCallback;
export const useMemo = R.useMemo;
export const useRef = R.useRef;
export const useContext = R.useContext;
export const useReducer = R.useReducer;
export const useLayoutEffect = R.useLayoutEffect;
export const useImperativeHandle = R.useImperativeHandle;
export const useDebugValue = R.useDebugValue;
export const useDeferredValue = R.useDeferredValue;
export const useTransition = R.useTransition;
export const useId = R.useId;
export const useSyncExternalStore = R.useSyncExternalStore;
export const useInsertionEffect = R.useInsertionEffect;
export const createContext = R.createContext;
export const createElement = R.createElement;
export const cloneElement = R.cloneElement;
export const isValidElement = R.isValidElement;
export const Children = R.Children;
export const Fragment = R.Fragment;
export const StrictMode = R.StrictMode;
export const Suspense = R.Suspense;
export const lazy = R.lazy;
export const memo = R.memo;
export const forwardRef = R.forwardRef;
export const startTransition = R.startTransition;
export const Component = R.Component;
export const PureComponent = R.PureComponent;
export const createRef = R.createRef;
export const use = R.use;
export const useOptimistic = R.useOptimistic;
export const useActionState = R.useActionState;
export const cache = R.cache;
export const __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = R.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;
`;
          const headers = new Headers();
          headers.set("Content-Type", "application/javascript; charset=utf-8");
          headers.set("Access-Control-Allow-Origin", "*");
          headers.set("Cache-Control", "no-cache");
          return new Response(shimContent.trim(), { status: 200, headers });
        }

        if (isReactDOMChunk) {
          console.debug(`[runtime] Detected ReactDOM chunk, replacing with shim: ${vitePath}`);
          const shimContent = `
// Shim: ReactDOM chunk -> window.__HANDS_REACT__
const R = window.__HANDS_REACT__?.React;
const RD = window.__HANDS_REACT__?.ReactDOM;
if (!RD) throw new Error("[hands-runtime] ReactDOM chunk requires window.__HANDS_REACT__");

// esbuild CJS interop - other chunks import these from this chunk
export function require_react() { return R; }
export function require_react_dom() { return RD; }
export function require_react_dom_development() { return RD; }

export { RD as exports };
export default RD;
export const createRoot = RD.createRoot;
export const hydrateRoot = RD.hydrateRoot;
export const createPortal = RD.createPortal;
export const flushSync = RD.flushSync;
export const unstable_batchedUpdates = RD.unstable_batchedUpdates;
export const version = RD.version;
export const __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = RD.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;
`;
          const headers = new Headers();
          headers.set("Content-Type", "application/javascript; charset=utf-8");
          headers.set("Access-Control-Allow-Origin", "*");
          headers.set("Cache-Control", "no-cache");
          return new Response(shimContent.trim(), { status: 200, headers });
        }
      }

      // Rewrite any nested imports in Vite deps to go through our proxy
      const runtimeOrigin = `http://localhost:${config.port}`;
      content = content.replace(/from\s+["'](\/[^"']+)["']/g, (_match, path) => {
        return `from "${runtimeOrigin}/vite-proxy${path}"`;
      });
      content = content.replace(/import\s+["'](\/[^"']+)["']/g, (_match, path) => {
        return `import "${runtimeOrigin}/vite-proxy${path}"`;
      });
      content = content.replace(/import\(["'](\/[^"']+)["']\)/g, (_match, path) => {
        return `import("${runtimeOrigin}/vite-proxy${path}")`;
      });

      const headers = new Headers();
      headers.set("Content-Type", "application/javascript; charset=utf-8");
      headers.set("Access-Control-Allow-Origin", "*");

      return new Response(content, {
        status: response.status,
        headers,
      });
    } catch (err) {
      console.error(`[runtime] Vite proxy failed:`, err);
      return c.json({ error: `Vite proxy failed: ${String(err)}` }, 502);
    }
  });

  // Proxy to block server for RSC routes
  app.all("/blocks/*", async (c) => {
    if (!state.viteReady || !state.vitePort) {
      // Include actual error message if block server crashed (e.g., compilation errors)
      const error = state.viteError || "Block server not ready";
      const booting = !state.viteError; // Only "booting" if there's no error
      return c.json({ error, booting, blockServerError: state.viteError }, 503);
    }

    const url = new URL(c.req.url);
    url.host = `localhost:${state.vitePort}`;

    try {
      const response = await fetch(url.toString(), {
        method: c.req.method,
        headers: c.req.raw.headers,
        body: c.req.method !== "GET" ? await c.req.text() : undefined,
      });

      // Copy headers but remove transfer-encoding to avoid conflicts
      // The Node.js server will handle chunked encoding itself
      const headers = new Headers(response.headers);
      headers.delete("transfer-encoding");

      return new Response(response.body, {
        status: response.status,
        headers,
      });
    } catch (err) {
      return c.json({ error: `Vite proxy failed: ${String(err)}` }, 502);
    }
  });

  // Proxy RSC component routes to block server
  // This allows the editor to render arbitrary components via Flight
  app.all("/rsc/*", async (c) => {
    if (!state.viteReady || !state.vitePort) {
      const error = state.viteError || "Block server not ready";
      const booting = !state.viteError;
      return c.json({ error, booting, blockServerError: state.viteError }, 503);
    }

    const url = new URL(c.req.url);
    url.host = `localhost:${state.vitePort}`;

    try {
      const response = await fetch(url.toString(), {
        method: c.req.method,
        headers: c.req.raw.headers,
        body: c.req.method !== "GET" ? await c.req.text() : undefined,
      });

      const headers = new Headers(response.headers);
      headers.delete("transfer-encoding");

      return new Response(response.body, {
        status: response.status,
        headers,
      });
    } catch (err) {
      return c.json({ error: `Vite proxy failed: ${String(err)}` }, 502);
    }
  });

  // Proxy editor sandbox routes to editor Vite dev server
  // Desktop loads editor via /sandbox/sandbox.html
  // Awaits the editor ready promise if not yet ready
  app.all("/sandbox/*", async (c) => {
    // If editor not ready, await the readiness promise
    if (!state.editorReady || !state.editorPort) {
      // If editor is down and we have config, try to restart it
      if (
        !state.editorProc &&
        state.editorConfig &&
        state.editorRestartCount < MAX_EDITOR_RESTARTS
      ) {
        console.log("[runtime] Editor down on request, triggering restart...");
        state.editorRestartCount++;
        bootEditor(state.editorConfig, true);
      }

      // Await the editor ready promise with a timeout
      if (state.editorReadyPromise) {
        const timeoutPromise = new Promise<void>((_, reject) => {
          setTimeout(() => reject(new Error("Editor startup timeout")), 30000);
        });
        try {
          await Promise.race([state.editorReadyPromise, timeoutPromise]);
        } catch {
          // Timeout or error - fall through to check state
        }
      }

      // Final check after awaiting
      if (!state.editorReady || !state.editorPort) {
        return c.json(
          {
            error: "Editor not ready",
            booting: !!state.editorProc,
            restartCount: state.editorRestartCount,
          },
          503,
        );
      }
    }

    // Rewrite /sandbox/foo to /foo on the editor server
    const url = new URL(c.req.url);
    url.host = `localhost:${state.editorPort}`;
    url.pathname = url.pathname.replace(/^\/sandbox/, "");

    try {
      const response = await fetch(url.toString(), {
        method: c.req.method,
        headers: c.req.raw.headers,
        body: c.req.method !== "GET" ? await c.req.text() : undefined,
      });

      const headers = new Headers(response.headers);
      headers.delete("transfer-encoding");

      // For HTML responses, rewrite Vite's internal paths to use /sandbox prefix
      // This ensures /@vite/client and /@react-refresh resolve correctly
      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("text/html")) {
        let html = await response.text();
        // Rewrite absolute Vite paths to use /sandbox prefix
        html = html.replace(/"\/@vite\//g, '"/sandbox/@vite/');
        html = html.replace(/"\/@react-refresh/g, '"/sandbox/@react-refresh');
        html = html.replace(/"\/@fs\//g, '"/sandbox/@fs/');
        return new Response(html, {
          status: response.status,
          headers,
        });
      }

      return new Response(response.body, {
        status: response.status,
        headers,
      });
    } catch (err) {
      // If proxy fails, editor might have crashed - mark as not ready
      if (state.editorReady) {
        console.error("[runtime] Editor proxy failed, marking as not ready:", err);
        state.editorReady = false;
      }
      return c.json({ error: `Editor proxy failed: ${String(err)}` }, 502);
    }
  });

  return app;
}

/**
 * Boot PGlite in background
 * Loads from .hands/db.tar.gz if exists, generates schema.ts
 * Also initializes pgtyped runner for type-safe SQL queries
 */
async function bootPGlite(workbookDir: string) {
  console.log(`[runtime] Booting database for ${workbookDir}...`);

  try {
    state.workbookDb = await initWorkbookDb(workbookDir);
    state.dbReady = true;
    console.log("[runtime] Database ready");

    // Initialize action runs table
    await initActionRunsTable(state.workbookDb.db);
    console.log("[runtime] Action runs table initialized");

    // Initialize thumbnails table
    await initThumbnailsTable(state.workbookDb.db);
    console.log("[runtime] Thumbnails table initialized");

    // Initialize pgtyped runner for type-safe SQL queries
    state.pgTypedRunner = createPgTypedRunner(workbookDir, state.workbookDb.db);

    // Run initial type generation for all block files (non-blocking)
    state.pgTypedRunner.runAll().catch((err) => {
      console.warn("[runtime] Initial pgtyped generation failed:", err);
    });

    // Start the action scheduler for cron-based actions
    startScheduler({
      workbookDir,
      getDb: () => state.workbookDb?.db ?? null,
      getSources: () => {
        // Return empty array - actions can discover sources dynamically
        return [];
      },
    });
    console.log("[runtime] Action scheduler started");
  } catch (err) {
    console.error("[runtime] Database failed:", err);
  }
}

/**
 * Boot page registry for MDX pages
 * Discovers pages from workbookDir/pages/
 */
async function bootPages(workbookDir: string) {
  const pagesDir = join(workbookDir, "pages");

  // Only initialize if pages directory exists
  if (!existsSync(pagesDir)) {
    console.log("[runtime] No pages/ directory found, skipping page registry");
    return;
  }

  console.log(`[runtime] Booting page registry for ${pagesDir}...`);

  try {
    state.pageRegistry = createPageRegistry({
      pagesDir,
      precompile: false, // Compile on demand for faster startup
    });

    const result = await state.pageRegistry.load();
    console.log(`[runtime] Page registry ready: ${result.pages.length} pages`);

    if (result.errors.length > 0) {
      console.warn("[runtime] Page discovery errors:");
      for (const err of result.errors) {
        console.warn(`  - ${err.file}: ${err.error}`);
      }
    }
  } catch (err) {
    console.error("[runtime] Page registry failed:", err);
  }
}

/**
 * Create block context for execution
 * Uses reader context (hands_reader role) for read-only access
 */
function _createBlockContext(params: Record<string, any> = {}): BlockContext {
  if (!state.workbookDb) {
    throw new Error("Database not ready");
  }
  // Use reader context for block rendering (read-only access to public schema)
  const dbCtx = state.workbookDb.readerCtx;
  return {
    db: dbCtx,
    sql: dbCtx.sql,
    query: dbCtx.query,
    params,
  };
}

/**
 * Extract the most relevant error from Vite output
 * Looks for common error patterns like "Cannot find module", "Error:", etc.
 */
function extractViteError(output: string): string | null {
  if (!output) return null;

  // Look for module resolution errors (most common)
  const moduleMatch = output.match(/Cannot find module ['"]([^'"]+)['"]/);
  if (moduleMatch) {
    // Find the full error line with context
    const errorLine = output.match(/Error:[^\n]*Cannot find module[^\n]*/);
    return errorLine ? errorLine[0] : `Cannot find module '${moduleMatch[1]}'`;
  }

  // Look for generic Error: lines
  const errorMatch = output.match(/Error:\s*([^\n]+)/);
  if (errorMatch) {
    return `Error: ${errorMatch[1]}`;
  }

  // Look for Vite-specific errors
  const viteErrorMatch = output.match(/\[vite\][^\n]*error[^\n]*/i);
  if (viteErrorMatch) {
    return viteErrorMatch[0];
  }

  // Fallback: return last non-empty line if it looks like an error
  const lines = output.trim().split("\n").filter(Boolean);
  const lastLine = lines[lines.length - 1];
  if (lastLine && (lastLine.includes("Error") || lastLine.includes("error"))) {
    return lastLine;
  }

  return null;
}

/**
 * Build and start Vite in background
 */
async function bootVite(config: RuntimeConfig) {
  const { workbookDir, workbookId } = config;
  const vitePort = PORTS.WORKER; // Use worker port for Vite (55200)

  console.log("[runtime] Building RSC project...");

  try {
    const buildResult = await buildRSC(workbookDir, { verbose: true });

    // Log errors but continue - fail open in dev mode
    if (!buildResult.success) {
      console.warn("[runtime] Build has errors (will start Vite anyway):");
      for (const err of buildResult.errors) {
        console.warn(`  - ${err}`);
      }
      // Store errors for status endpoint
      state.buildErrors = buildResult.errors;
    }

    const handsDir = buildResult.outputDir;
    console.log(`[runtime] Built to ${handsDir}`);

    // Install deps if needed
    const nodeModules = join(handsDir, "node_modules");
    if (!existsSync(nodeModules)) {
      console.log("[runtime] Installing dependencies...");
      await new Promise<void>((resolve, reject) => {
        const proc = spawn("bun", ["install"], {
          cwd: handsDir,
          stdio: "inherit",
        });
        proc.on("close", (code) => {
          if (code === 0) resolve();
          else reject(new Error(`bun install failed with code ${code}`));
        });
      });
    }

    // Ensure Vite port is free before starting
    const portFree = await waitForPortFree(vitePort, 3000, true);
    if (!portFree) {
      throw new Error(`Port ${vitePort} is still in use after cleanup attempt`);
    }

    // Start Vite
    console.log(`[runtime] Starting Vite on port ${vitePort}...`);
    state.viteProc = spawn(
      "npx",
      ["vite", "dev", "--port", String(vitePort), "--host", "127.0.0.1"],
      {
        cwd: handsDir,
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          WORKBOOK_ID: workbookId,
          WORKBOOK_DIR: workbookDir,
          RUNTIME_PORT: String(config.port),
        },
      },
    );

    // Forward Vite output but ignore EPIPE errors on shutdown
    // Capture both stdout and stderr for error reporting
    // Vite module errors often go to stdout, not stderr
    let outputBuffer = "";
    const captureOutput = (data: Buffer) => {
      const str = data.toString();
      outputBuffer += str;
      // Keep only last 4000 chars
      if (outputBuffer.length > 4000) {
        outputBuffer = outputBuffer.slice(-4000);
      }
    };
    state.viteProc.stdout?.on("data", (data) => {
      captureOutput(data);
      process.stdout.write(data, () => {});
    });
    state.viteProc.stderr?.on("data", (data) => {
      captureOutput(data);
      process.stderr.write(data, () => {});
    });

    // Monitor for crashes - reset viteReady if process exits
    state.viteProc.on("exit", (code, signal) => {
      if (state.viteReady) {
        console.error(`[runtime] Vite crashed (code=${code}, signal=${signal})`);
        state.viteReady = false;
        state.viteError = extractViteError(outputBuffer) || `Vite exited with code ${code}`;
        state.viteProc = null;

        // Clear Vite cache on crash - often fixes pre-bundle errors
        const viteCacheDir = join(handsDir, "node_modules", ".vite");
        if (existsSync(viteCacheDir)) {
          console.log("[runtime] Clearing Vite cache after crash...");
          try {
            const { rmSync } = require("node:fs");
            rmSync(viteCacheDir, { recursive: true, force: true });
          } catch (err) {
            console.warn("[runtime] Failed to clear Vite cache:", err);
          }
        }
      }
    });

    // Wait for Vite to be ready
    const timeout = 30000;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        const response = await fetch(`http://localhost:${vitePort}/health`, {
          signal: AbortSignal.timeout(1000),
        });
        if (response.ok) {
          state.vitePort = vitePort;
          state.viteReady = true;
          state.viteError = null; // Clear any previous error
          console.log(`[runtime] Vite ready on port ${vitePort}`);
          return;
        }
        // If we get a response but it's an error, capture it
        // This can happen when Vite starts but module loading fails
        if (response.status >= 400) {
          try {
            const text = await response.text();
            // Look for module errors in the response
            const moduleMatch = text.match(/Cannot find module ['"]([^'"]+)['"]/);
            if (moduleMatch) {
              state.viteError = `Cannot find module '${moduleMatch[1]}'`;
            }
          } catch {
            // Ignore response parsing errors
          }
        }
      } catch {
        // Not ready yet - connection refused or timeout
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    // Timeout - use already captured error or extract from output buffer
    if (!state.viteError) {
      const extractedError = extractViteError(outputBuffer);
      state.viteError = extractedError || "Vite failed to start within timeout";
    }
    console.error("[runtime] Vite failed to start within timeout");
    if (outputBuffer) {
      console.error("[runtime] Captured output:\n", outputBuffer);
    }
  } catch (err) {
    console.error("[runtime] Vite boot failed:", err);
  }
}

/**
 * Boot the editor sandbox Vite dev server
 * This serves the visual editor UI that runs inside the iframe
 * Supports automatic restart on crash (up to MAX_EDITOR_RESTARTS times)
 *
 * Returns a promise that resolves when the editor is ready.
 * Also stores the promise in state.editorReadyPromise for request handlers to await.
 */
async function bootEditor(config: RuntimeConfig, isRestart = false) {
  // Store config for potential restarts
  state.editorConfig = config;

  const editorPort = PORTS.EDITOR;
  const editorPath = getEditorSourcePath();

  // Ensure editor port is free before starting
  const portFree = await waitForPortFree(editorPort, 3000, true);
  if (!portFree) {
    console.error(`[runtime] Editor port ${editorPort} is still in use after cleanup attempt`);
  }

  if (!existsSync(editorPath)) {
    console.warn(`[runtime] Editor package not found at ${editorPath}, skipping editor server`);
    // Resolve promise immediately since there's nothing to wait for
    state.editorReadyPromise = Promise.resolve();
    return;
  }

  // Create a new promise that will resolve when the editor is ready
  // This allows request handlers to await editor readiness
  state.editorReadyPromise = new Promise<void>((resolve) => {
    state.editorReadyResolve = resolve;
  });

  if (isRestart) {
    console.log(
      `[runtime] Restarting editor sandbox (attempt ${state.editorRestartCount + 1}/${MAX_EDITOR_RESTARTS})...`,
    );
  } else {
    console.log(`[runtime] Starting editor sandbox on port ${editorPort}...`);
  }

  try {
    // Start Vite for the editor sandbox using bun to run the package script
    // This ensures we use the package's local vite version
    state.editorProc = spawn(
      "bun",
      [
        "run",
        "vite",
        "--config",
        "vite.sandbox.config.ts",
        "--port",
        String(editorPort),
        "--host",
        "127.0.0.1",
      ],
      {
        cwd: editorPath,
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          // Pass runtime port so editor knows where to fetch RSC/API
          RUNTIME_PORT: String(config.port),
        },
      },
    );

    let stderrBuffer = "";

    // Forward output
    state.editorProc.stdout?.on("data", (data) => {
      process.stdout.write(`[editor] ${data}`);
    });
    state.editorProc.stderr?.on("data", (data) => {
      const str = data.toString();
      stderrBuffer += str;
      process.stderr.write(`[editor] ${str}`);
    });

    state.editorProc.on("exit", (code, signal) => {
      const wasReady = state.editorReady;
      state.editorReady = false;
      state.editorProc = null;

      if (wasReady) {
        console.error(`[runtime] Editor crashed (code=${code}, signal=${signal})`);
        if (stderrBuffer) {
          console.error(`[runtime] Editor stderr: ${stderrBuffer.slice(-500)}`);
        }

        // Attempt restart if under limit
        if (state.editorRestartCount < MAX_EDITOR_RESTARTS && state.editorConfig) {
          state.editorRestartCount++;
          console.log(`[runtime] Attempting editor restart in 1s...`);
          setTimeout(() => {
            bootEditor(state.editorConfig!, true);
          }, 1000);
        } else if (state.editorRestartCount >= MAX_EDITOR_RESTARTS) {
          console.error(
            `[runtime] Editor exceeded max restarts (${MAX_EDITOR_RESTARTS}), giving up`,
          );
        }
      }
    });

    // Wait for editor to be ready
    const timeout = 30000;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        const response = await fetch(`http://localhost:${editorPort}/sandbox.html`, {
          signal: AbortSignal.timeout(1000),
        });
        if (response.ok) {
          state.editorPort = editorPort;
          state.editorReady = true;
          // Reset restart count on successful boot
          if (isRestart) {
            console.log(`[runtime] Editor recovered successfully on port ${editorPort}`);
          } else {
            console.log(`[runtime] Editor ready on port ${editorPort}`);
          }
          state.editorRestartCount = 0;
          // Resolve the promise so any waiting requests can proceed
          if (state.editorReadyResolve) {
            state.editorReadyResolve();
            state.editorReadyResolve = null;
          }
          return;
        }
      } catch {
        // Not ready yet
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    console.error("[runtime] Editor failed to start within timeout");
  } catch (err) {
    console.error("[runtime] Editor boot failed:", err);
  }
}

/**
 * Run the check command - diagnostics without starting server
 *
 * Usage: hands-runtime check <workbook-dir> [--json] [--fix]
 */
async function runCheck() {
  const args = process.argv.slice(2);
  // Remove 'check' command
  const restArgs = args.slice(1);

  // Parse args
  let workbookDir = process.cwd();
  let jsonOutput = false;
  let autoFix = false;

  for (const arg of restArgs) {
    if (arg === "--json") {
      jsonOutput = true;
    } else if (arg === "--fix") {
      autoFix = true;
    } else if (!arg.startsWith("-")) {
      workbookDir = arg;
    }
  }

  // Resolve relative paths
  if (!workbookDir.startsWith("/")) {
    workbookDir = join(process.cwd(), workbookDir);
  }

  // Use preflight system for all checks
  const { runPreflight, printPreflightResults } = await import("./preflight.js");
  const result = await runPreflight({
    workbookDir,
    autoFix,
    verbose: !jsonOutput,
  });

  if (jsonOutput) {
    // JSON output for scripting
    console.log(
      JSON.stringify(
        {
          success: result.ok,
          workbookDir,
          duration: result.duration,
          checks: result.checks.map((c) => ({
            name: c.name,
            ok: c.ok,
            message: c.message,
            required: c.required,
            fixed: c.fixed ?? false,
          })),
        },
        null,
        2,
      ),
    );
  } else {
    // Human-readable output
    printPreflightResults(result);
  }

  process.exit(result.ok ? 0 : 1);
}

/**
 * Main entry point
 */
async function main() {
  // Check for 'check' subcommand early
  const firstArg = process.argv[2];
  if (firstArg === "check") {
    await runCheck();
    return;
  }

  const config = parseArgs();
  const { workbookId, workbookDir, port } = config;

  console.log(`[runtime] Starting workbook: ${workbookId}`);

  // Run comprehensive preflight checks (validates environment, fixes issues)
  const { runPreflight, printPreflightResults } = await import("./preflight.js");
  const preflightResult = await runPreflight({
    workbookDir,
    port,
    autoFix: true,
    verbose: true,
  });

  if (!preflightResult.ok) {
    printPreflightResults(preflightResult);
    process.exit(1);
  }

  // Log any auto-fixed issues
  const fixedChecks = preflightResult.checks.filter((c) => c.fixed);
  if (fixedChecks.length > 0) {
    console.log(`[runtime] Auto-fixed ${fixedChecks.length} issue(s)`);
  }

  // 1. Start HTTP server using Node's http module with Hono
  const app = createApp(config);
  const server = createServer(async (req, res) => {
    try {
      // Convert Node request to fetch Request
      const url = `http://localhost:${port}${req.url}`;
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (value) headers.set(key, Array.isArray(value) ? value.join(", ") : value);
      }

      const body =
        req.method !== "GET" && req.method !== "HEAD"
          ? await new Promise<Buffer>((resolve) => {
              const chunks: Buffer[] = [];
              req.on("data", (chunk) => chunks.push(chunk));
              req.on("end", () => resolve(Buffer.concat(chunks)));
            })
          : undefined;

      const request = new Request(url, {
        method: req.method,
        headers,
        body,
      });

      // Get response from Hono
      const response = await app.fetch(request);

      // Send response
      res.statusCode = response.status;
      response.headers.forEach((value, key) => {
        res.setHeader(key, value);
      });

      const responseBody = await response.arrayBuffer();
      res.end(Buffer.from(responseBody));
    } catch (err) {
      console.error("Request error:", err);
      res.statusCode = 500;
      res.end("Internal Server Error");
    }
  });

  // Handle port binding errors with retry
  server.on("error", async (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.error(`[runtime] Port ${port} in use, attempting to free it...`);
      const { killProcessOnPort } = await import("./ports.js");
      await killProcessOnPort(port);
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Retry once
      server.listen(port, () => {
        console.log(`[runtime] Server ready on http://localhost:${port} (after retry)`);
        console.log(`[runtime] Manifest available at http://localhost:${port}/workbook/manifest`);
        console.log(
          JSON.stringify({
            type: "ready",
            runtimePort: port,
            postgresPort: port,
            workerPort: PORTS.WORKER,
          }),
        );
      });
    } else {
      console.error(`[runtime] Server error:`, err);
      process.exit(1);
    }
  });

  server.listen(port, () => {
    console.log(`[runtime] Server ready on http://localhost:${port}`);
    console.log(`[runtime] Manifest available at http://localhost:${port}/workbook/manifest`);

    // Output ready JSON for Tauri - format must match lib.rs expectations
    console.log(
      JSON.stringify({
        type: "ready",
        runtimePort: port,
        postgresPort: port, // PGlite is in-process, use same port
        workerPort: PORTS.WORKER,
      }),
    );
  });

  // 3. Boot critical services in parallel (non-blocking)
  // All are independent and can start simultaneously
  bootPGlite(workbookDir);
  bootVite(config);
  if (!config.noEditor) {
    bootEditor(config);
  } else {
    console.log("[runtime] Editor disabled (--no-editor)");
  }
  bootPages(workbookDir);

  // 4. Start file watcher for real-time manifest updates
  startFileWatcher(config);

  // Handle shutdown
  const shutdown = async () => {
    console.log("[runtime] Shutting down...");
    // Stop the action scheduler
    stopScheduler();
    // Close file watchers
    for (const watcher of state.fileWatchers) {
      watcher.close();
    }
    if (state.viteProc) state.viteProc.kill();
    if (state.editorProc) state.editorProc.kill();
    if (state.workbookDb) {
      await state.workbookDb.save();
      await state.workbookDb.close();
    }
    server.close();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
