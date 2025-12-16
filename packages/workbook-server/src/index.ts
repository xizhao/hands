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
import { existsSync, type FSWatcher, readdirSync, readFileSync, rmSync, watch, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SourceDefinitionV2 } from "@hands/stdlib/sources";
import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  discoverActions,
  startScheduler,
  stopScheduler,
} from "./actions/index.js";
import { getEditorSourcePath, getRuntimeSourcePath } from "./config/index.js";
import { PORTS, waitForPortFree } from "./ports.js";
import { registerSourceRoutes } from "./sources/index.js";
import { registerTRPCRoutes } from "./trpc/index.js";
import { PageRegistry, createPageRegistry, renderPage, type PageRenderContext } from "./pages/index.js";

interface RuntimeConfig {
  workbookId: string;
  workbookDir: string;
  port: number;
  noEditor?: boolean;
}

interface RuntimeState {
  /** Runtime ready - includes SQLite database */
  rscReady: boolean;
  rscPort: number | null;
  rscProc: ChildProcess | null;
  rscError: string | null;
  editorReady: boolean;
  editorPort: number | null;
  editorProc: ChildProcess | null;
  editorRestartCount: number;
  editorReadyPromise: Promise<void> | null;
  editorReadyResolve: (() => void) | null;
  editorConfig: RuntimeConfig | null;
  fileWatchers: FSWatcher[];
  buildErrors: string[];
  pageRegistry: PageRegistry | null;
}

// Global state for progressive readiness
const state: RuntimeState = {
  rscReady: false,
  rscPort: null,
  rscProc: null,
  rscError: null,
  editorReady: false,
  editorPort: null,
  editorProc: null,
  editorRestartCount: 0,
  editorReadyPromise: null,
  editorReadyResolve: null,
  editorConfig: null,
  buildErrors: [],
  fileWatchers: [],
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

  // Read config from package.json
  let config: Record<string, any> = {};
  const pkgJsonPath = join(workbookDir, "package.json");
  if (existsSync(pkgJsonPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf-8"));
      config = pkg.hands || {};
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

// Guard against concurrent block reloads
let blockReloadPending = false;
let blockReloadTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Handle block file changes.
 *
 * The runtime package uses import.meta.glob for dynamic block discovery,
 * so Vite handles HMR automatically. We just log the event.
 */
async function hotReloadBlocks(_config: RuntimeConfig) {
  // Debounce rapid reload requests (fs.watch can fire multiple times)
  if (blockReloadTimer) {
    clearTimeout(blockReloadTimer);
  }

  blockReloadTimer = setTimeout(async () => {
    // Guard against concurrent reloads
    if (blockReloadPending) {
      return;
    }

    blockReloadPending = true;

    try {
      // Runtime package uses import.meta.glob for dynamic discovery
      // Vite's file watcher handles HMR automatically
      console.log("[runtime] Block files changed - Vite will handle HMR");
    } finally {
      blockReloadPending = false;
      blockReloadTimer = null;
    }
  }, 200);
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

            // Hot-reload blocks via HMR (or fallback to restart)
            await hotReloadBlocks(config);
          } else {
            // Just a file edit - Vite handles HMR automatically
            console.log(`[runtime] Block file edited: ${filename}`);
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
 * Create the Hono app for instant serving
 */
function createApp(config: RuntimeConfig) {
  const app = new Hono();

  // CORS
  app.use("/*", cors());

  // ============================================
  // Page Rendering Route (kept as HTTP - returns HTML)
  // ============================================

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
      blockServerPort: state.rscPort ?? undefined,
      useRsc: state.rscReady,
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

  // ============================================
  // Utility Routes (kept as HTTP)
  // ============================================

  // Get block context (for Vite server to use)
  app.get("/ctx", async (c) => {
    if (!state.rscReady) {
      return c.json({ error: "Runtime not ready", booting: true }, 503);
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
  // Media Upload (images/videos/audio to public/)
  // ============================================
  app.post("/upload", async (c) => {
    try {
      const formData = await c.req.formData();
      const file = formData.get("file") as File | null;

      if (!file) {
        return c.json({ error: "No file provided" }, 400);
      }

      // Only allow media files
      const allowedTypes = ["image/", "video/", "audio/"];
      const isMedia = allowedTypes.some((type) => file.type.startsWith(type));
      if (!isMedia) {
        return c.json({ error: "Only image, video, and audio files are allowed" }, 400);
      }

      // Create public directory if it doesn't exist
      const publicDir = join(config.workbookDir, "public");
      if (!existsSync(publicDir)) {
        const { mkdirSync } = await import("node:fs");
        mkdirSync(publicDir, { recursive: true });
      }

      // Generate unique filename to avoid collisions
      const ext = file.name.split(".").pop() || "";
      const timestamp = Date.now();
      const randomId = Math.random().toString(36).substring(2, 8);
      const safeOriginalName = file.name
        .replace(/\.[^/.]+$/, "") // remove extension
        .replace(/[^a-zA-Z0-9-_]/g, "-") // sanitize
        .substring(0, 50); // limit length
      const filename = `${safeOriginalName}-${timestamp}-${randomId}.${ext}`;

      // Write file
      const filePath = join(publicDir, filename);
      const buffer = await file.arrayBuffer();
      const { writeFileSync } = await import("node:fs");
      writeFileSync(filePath, Buffer.from(buffer));

      console.log(`[runtime] Uploaded media: ${filename} (${file.type}, ${file.size} bytes)`);

      // Return URL relative to public/
      return c.json({
        url: `/public/${filename}`,
        name: file.name,
        size: file.size,
        type: file.type,
      });
    } catch (err) {
      console.error("[runtime] Upload failed:", err);
      return c.json({ error: "Upload failed" }, 500);
    }
  });

  // Serve public/ directory for uploaded media
  app.get("/public/*", async (c) => {
    const filePath = c.req.path.replace("/public/", "");
    const fullPath = join(config.workbookDir, "public", filePath);

    if (!existsSync(fullPath)) {
      return c.json({ error: "File not found" }, 404);
    }

    try {
      const { readFileSync } = await import("node:fs");
      const content = readFileSync(fullPath);

      // Determine content type
      const ext = filePath.split(".").pop()?.toLowerCase() || "";
      const mimeTypes: Record<string, string> = {
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        png: "image/png",
        gif: "image/gif",
        webp: "image/webp",
        svg: "image/svg+xml",
        mp4: "video/mp4",
        webm: "video/webm",
        mov: "video/quicktime",
        mp3: "audio/mpeg",
        wav: "audio/wav",
        ogg: "audio/ogg",
      };
      const contentType = mimeTypes[ext] || "application/octet-stream";

      return new Response(content, {
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=31536000",
        },
      });
    } catch (err) {
      console.error("[runtime] Failed to serve file:", err);
      return c.json({ error: "Failed to serve file" }, 500);
    }
  });

  // ============================================
  // Source Management Routes
  // ============================================
  registerSourceRoutes(app, {
    workbookDir: config.workbookDir,
    isDbReady: () => state.rscReady,
    // Note: getDb not provided - sources use SQLite via runtime now
  });

  // ============================================
  // Action Webhook Routes
  // ============================================
  // Note: Webhooks temporarily disabled - need to update to use SQLite via runtime
  // registerWebhookRoutes(app, {
  //   workbookDir: config.workbookDir,
  //   isDbReady: () => state.rscReady,
  //   getDb: () => null,
  //   getSources: () => [],
  // });

  // ============================================
  // tRPC Routes (type-safe API)
  // ============================================
  registerTRPCRoutes(app, {
    workbookId: config.workbookId,
    workbookDir: config.workbookDir,
    // SQLite database lives in the runtime - provide runtime URL
    getRuntimeUrl: () => (state.rscReady && state.rscPort ? `http://localhost:${state.rscPort}` : null),
    isDbReady: () => state.rscReady,
    getState: () => ({
      rscReady: state.rscReady,
      rscPort: state.rscPort,
      rscError: state.rscError,
      editorReady: state.editorReady,
      editorPort: state.editorPort,
      editorRestartCount: state.editorRestartCount,
      buildErrors: state.buildErrors,
    }),
    // External manifest provides sources, actions, config (blocks/pages now come from discovery)
    getExternalManifest: async () => {
      const manifest = await getManifest(config.workbookDir, config.workbookId);
      return {
        sources: manifest.sources,
        actions: manifest.actions,
        config: manifest.config,
      };
    },
    formatBlockSource: (filePath: string) => formatBlockSource(filePath, config.workbookDir),
    generateDefaultBlockSource,
    onSchemaChange: async () => {
      // Schema regeneration is handled by the runtime
      console.log("[runtime] Schema changed - runtime will handle regeneration");
    },
    getPageRegistry: () => state.pageRegistry,
    createPageRegistry: (pagesDir: string) => {
      state.pageRegistry = createPageRegistry({ pagesDir, precompile: false });
      return state.pageRegistry;
    },
  });

  // Serve client modules for RSC hydration
  // These are "use client" components that need to be loaded client-side
  // Path format: /client-modules/ui/counter-button.tsx -> blocks/ui/counter-button.tsx
  app.get("/client-modules/*", async (c) => {
    if (!state.rscReady || !state.rscPort) {
      const error = state.rscError || "Block server not ready";
      const booting = !state.rscError;
      return c.json({ error, booting, blockServerError: state.rscError }, 503);
    }

    // Extract the module path from the request
    const modulePath = c.req.path.replace("/client-modules", "");

    // Request this module from Vite using the fs prefix for absolute paths
    // Vite's dev server can serve files outside the root using /@fs/ prefix
    const blocksDir = join(config.workbookDir, "blocks");
    const absolutePath = join(blocksDir, modulePath);
    const viteUrl = `http://localhost:${state.rscPort}/@fs${absolutePath}`;

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
    if (!state.rscReady || !state.rscPort) {
      const error = state.rscError || "Block server not ready";
      const booting = !state.rscError;
      return c.json({ error, booting, blockServerError: state.rscError }, 503);
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

    const viteUrl = `http://localhost:${state.rscPort}${vitePath}`;

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

  // Proxy tunnel metadata from RSC runtime
  app.get("/__hands__", async (c) => {
    if (!state.rscReady || !state.rscPort) {
      return c.json({ publicUrl: null, localUrl: "", status: "connecting" });
    }

    try {
      const response = await fetch(`http://localhost:${state.rscPort}/__hands__`, {
        signal: AbortSignal.timeout(2000),
      });
      const data = await response.json();
      return c.json(data);
    } catch {
      return c.json({ publicUrl: null, localUrl: "", status: "error", error: "Failed to fetch tunnel status" });
    }
  });

  // Proxy to block server for RSC routes (editor-only)
  app.all("/_editor/blocks/*", async (c) => {
    if (!state.rscReady || !state.rscPort) {
      // Include actual error message if block server crashed (e.g., compilation errors)
      const error = state.rscError || "Block server not ready";
      const booting = !state.rscError; // Only "booting" if there's no error
      return c.json({ error, booting, blockServerError: state.rscError }, 503);
    }

    const url = new URL(c.req.url);
    url.host = `localhost:${state.rscPort}`;

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

  // Proxy /_client/* to Vite for editor client component loading
  // The editorPlugin in runtime handles React shimming for cross-origin loading
  app.all("/_client/*", async (c) => {
    if (!state.rscReady || !state.rscPort) {
      const error = state.rscError || "Block server not ready";
      return c.json({ error }, 503);
    }

    const url = new URL(c.req.url);
    url.host = `localhost:${state.rscPort}`;

    try {
      const response = await fetch(url.toString(), {
        method: c.req.method,
        headers: c.req.raw.headers,
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

  // Proxy RSC component routes to block server
  // This allows the editor to render arbitrary components via Flight
  app.all("/rsc/*", async (c) => {
    if (!state.rscReady || !state.rscPort) {
      const error = state.rscError || "Block server not ready";
      const booting = !state.rscError;
      return c.json({ error, booting, blockServerError: state.rscError }, 503);
    }

    const url = new URL(c.req.url);
    url.host = `localhost:${state.rscPort}`;

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
 * Boot the RSC runtime in background
 *
 * Uses the @hands/runtime package which has a static vite.config.mts.
 * The runtime uses HANDS_WORKBOOK_PATH env var to locate the workbook.
 */
async function bootRuntime(config: RuntimeConfig) {
  const { workbookDir } = config;
  const rscPort = PORTS.WORKER; // RSC runtime port (55200)

  // Get the runtime package path (contains vite.config.mts)
  const runtimePath = getRuntimeSourcePath();
  console.log(`[runtime] Using runtime at: ${runtimePath}`);

  if (!existsSync(join(runtimePath, "vite.config.mts"))) {
    console.error(`[runtime] vite.config.mts not found in runtime package at ${runtimePath}`);
    state.rscError = "Runtime package vite.config.mts not found";
    return;
  }

  try {
    // Ensure port is free before starting
    const portFree = await waitForPortFree(rscPort, 3000, true);
    if (!portFree) {
      throw new Error(`Port ${rscPort} is still in use after cleanup attempt`);
    }

    // Spawn RSC runtime from the runtime package directory
    // The runtime's vite.config.mts uses HANDS_WORKBOOK_PATH to locate the workbook
    console.log(`[runtime] Starting RSC runtime on port ${rscPort}...`);
    state.rscProc = spawn(
      "npx",
      ["vite", "dev", "--port", String(rscPort), "--host", "127.0.0.1"],
      {
        cwd: runtimePath,
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          HANDS_WORKBOOK_PATH: workbookDir,
        },
      },
    );

    // Forward runtime output with [worker] prefix for visibility
    let outputBuffer = "";
    const captureOutput = (data: Buffer) => {
      const str = data.toString();
      outputBuffer += str;
      if (outputBuffer.length > 4000) {
        outputBuffer = outputBuffer.slice(-4000);
      }
    };
    const prefixLines = (data: Buffer, prefix: string) => {
      const str = data.toString();
      return str.split('\n').map(line => line ? `${prefix} ${line}` : '').join('\n');
    };
    state.rscProc.stdout?.on("data", (data) => {
      captureOutput(data);
      const prefixed = prefixLines(data, "[worker]");
      if (prefixed.trim()) {
        console.log(prefixed);
      }
    });
    state.rscProc.stderr?.on("data", (data) => {
      captureOutput(data);
      const prefixed = prefixLines(data, "[worker]");
      if (prefixed.trim()) {
        console.error(prefixed);
      }
    });

    // Monitor for crashes and auto-restart
    state.rscProc.on("exit", (code, signal) => {
      const wasReady = state.rscReady;
      console.error(`[runtime] RSC runtime exited (code=${code}, signal=${signal}, wasReady=${wasReady})`);
      state.rscReady = false;
      state.rscError = extractViteError(outputBuffer) || `RSC runtime exited with code ${code}`;
      state.rscProc = null;

      // Clear cache on crash
      const cacheDir = join(runtimePath, "node_modules", ".vite");
      if (existsSync(cacheDir)) {
        console.log("[runtime] Clearing cache after crash...");
        try {
          rmSync(cacheDir, { recursive: true, force: true });
        } catch (err) {
          console.warn("[runtime] Failed to clear cache:", err);
        }
      }

      // Auto-restart after a delay (unless this was a clean shutdown)
      if (code !== 0 && code !== null) {
        console.log("[runtime] Auto-restarting RSC runtime in 2s...");
        setTimeout(() => {
          bootRuntime(config).catch((err) => {
            console.error("[runtime] Failed to restart RSC runtime:", err);
          });
        }, 2000);
      }
    });

    // Wait for runtime to be ready
    const timeout = 30000;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        const response = await fetch(`http://localhost:${rscPort}/health`, {
          signal: AbortSignal.timeout(1000),
        });
        if (response.ok) {
          state.rscPort = rscPort;
          state.rscReady = true;
          state.rscError = null;
          console.log(`[runtime] RSC runtime ready on port ${rscPort}`);
          return;
        }
        if (response.status >= 400) {
          try {
            const text = await response.text();
            const moduleMatch = text.match(/Cannot find module ['"]([^'"]+)['"]/);
            if (moduleMatch) {
              state.rscError = `Cannot find module '${moduleMatch[1]}'`;
            }
          } catch {
            // Ignore response parsing errors
          }
        }
      } catch {
        // Not ready yet
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    // Timeout
    if (!state.rscError) {
      const extractedError = extractViteError(outputBuffer);
      state.rscError = extractedError || "RSC runtime failed to start within timeout";
    }
    console.error("[runtime] RSC runtime failed to start within timeout");
    if (outputBuffer) {
      console.error("[runtime] Captured output:\n", outputBuffer);
    }
  } catch (err) {
    console.error("[runtime] RSC runtime boot failed:", err);
    state.rscError = err instanceof Error ? err.message : String(err);
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

  // 1. Start HTTP server using Bun's native server with Hono
  const app = createApp(config);

  let server: ReturnType<typeof Bun.serve>;

  const startServer = async (retried = false) => {
    try {
      server = Bun.serve({
        port,
        fetch: app.fetch,
        error(error) {
          console.error("[runtime] Request error:", error);
          return new Response("Internal Server Error", { status: 500 });
        },
      });

      console.log(`[runtime] Server ready on http://localhost:${port}${retried ? " (after retry)" : ""}`);
      console.log(`[runtime] Manifest available at http://localhost:${port}/workbook/manifest`);
    } catch (err: any) {
      if (err?.code === "EADDRINUSE" && !retried) {
        console.error(`[runtime] Port ${port} in use, attempting to free it...`);
        const { killProcessOnPort } = await import("./ports.js");
        await killProcessOnPort(port);
        await new Promise((resolve) => setTimeout(resolve, 1000));
        await startServer(true);
      } else {
        console.error(`[runtime] Server error:`, err);
        process.exit(1);
      }
    }
  };

  await startServer();

  // 3. Boot critical services - pages can run in parallel (non-blocking)
  bootPages(workbookDir);

  // Output ready JSON for Tauri - format must match lib.rs expectations
  // Note: Database is SQLite in runtime, accessible via runtimePort
  console.log(
    JSON.stringify({
      type: "ready",
      runtimePort: port,
    }),
  );

  // Boot Vite (block server) - can take a few seconds
  // Editor/sandbox will show loading state until worker is ready
  bootRuntime(config).catch((err) => {
    console.error("[runtime] Vite boot failed:", err);
    state.rscError = err instanceof Error ? err.message : String(err);
  });

  // Editor can start in parallel with Vite
  if (!config.noEditor) {
    bootEditor(config);
  } else {
    console.log("[runtime] Editor disabled (--no-editor)");
  }

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
    // Close runtime process (SQLite database lives in runtime)
    if (state.rscProc) state.rscProc.kill();
    if (state.editorProc) state.editorProc.kill();
    server.stop();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
