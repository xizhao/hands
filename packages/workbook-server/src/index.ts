#!/usr/bin/env bun

/**
 * Hands Workbook Server
 *
 * Lightweight server for the desktop editor:
 * - Direct SQLite access via bun:sqlite
 * - tRPC API for editor operations
 * - File watching for page updates
 * - Deploy via bundled builder.js
 *
 * Usage:
 *   hands-runtime --workbook-id=<id> --workbook-dir=<dir> [--port=<port>]
 *   hands-runtime check <workbook-dir> [--json] [--strict]
 */

import { existsSync, type FSWatcher, readdirSync, readFileSync, watch } from "node:fs";
import { join } from "node:path";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { stopScheduler } from "./actions/index.js";
import { closeAllWorkbookDbs } from "./db/workbook-db.js";
import { createPageRegistry, type PageRegistry } from "./pages/index.js";
import { PORTS } from "./ports.js";
import { registerTRPCRoutes } from "./trpc/index.js";

interface RuntimeConfig {
  workbookId: string;
  workbookDir: string;
  port: number;
}

interface ServerState {
  fileWatchers: FSWatcher[];
  pageRegistry: PageRegistry | null;
}

const state: ServerState = {
  fileWatchers: [],
  pageRegistry: null,
};

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
    console.error("Usage: hands-runtime --workbook-id=<id> --workbook-dir=<dir> [--port=<port>]");
    process.exit(1);
  }

  return {
    workbookId: args.workbook_id,
    workbookDir: args.workbook_dir,
    port: args.port ? parseInt(args.port, 10) : PORTS.RUNTIME,
  };
}

/**
 * Read config from package.json
 */
function getConfig(workbookDir: string): Record<string, unknown> {
  const pkgJsonPath = join(workbookDir, "package.json");
  if (existsSync(pkgJsonPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf-8"));
      return pkg.hands || {};
    } catch {
      return {};
    }
  }
  return {};
}

/**
 * Format a block source file with Biome + TypeScript import organization
 */
async function formatBlockSource(filePath: string, workbookDir: string): Promise<boolean> {
  try {
    const blocksDir = join(workbookDir, "blocks");

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

    const { spawnSync } = await import("node:child_process");
    const biomePath = join(workbookDir, "node_modules", ".bin", "biome");
    const globalBiomePath = join(import.meta.dirname, "..", "node_modules", ".bin", "biome");
    const biomeCmd = existsSync(biomePath) ? biomePath : globalBiomePath;

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
            javascript: {
              formatter: { semicolons: "asNeeded", quoteStyle: "single" },
            },
          },
          null,
          2,
        ),
      );
    }

    spawnSync(biomeCmd, ["check", "--write", filePath], { cwd: workbookDir });
    return true;
  } catch (err) {
    console.error("[server] Format failed:", err);
    return false;
  }
}

/**
 * Generate default block source code
 */
function generateDefaultBlockSource(blockId: string): string {
  const functionName = blockId
    .split(/[-_]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join("");

  return `import type { BlockFn, BlockMeta } from "@hands/stdlib"

const ${functionName}: BlockFn = async ({ ctx }) => {
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
 * Start watching pages/ directory for changes
 */
function startFileWatcher(config: RuntimeConfig) {
  const { workbookDir } = config;
  const pagesDir = join(workbookDir, "pages");

  if (existsSync(pagesDir)) {
    try {
      const pagesWatcher = watch(pagesDir, { recursive: true }, async (_event, filename) => {
        if (
          filename &&
          (filename.endsWith(".md") ||
            filename.endsWith(".mdx") ||
            filename.endsWith(".plate.json"))
        ) {
          if (state.pageRegistry) {
            try {
              await state.pageRegistry.load();
            } catch (err) {
              console.warn("[server] Failed to reload page registry:", err);
            }
          }
        }
      });
      state.fileWatchers.push(pagesWatcher);
      console.log("[server] Watching pages/ for changes");
    } catch (err) {
      console.warn("[server] Could not watch pages/:", err);
    }
  }
}

/**
 * Create the Hono app
 */
function createApp(config: RuntimeConfig) {
  const app = new Hono();

  app.use("/*", cors());

  // Stop endpoint for graceful shutdown
  app.post("/stop", async (c) => {
    console.log("[server] Stop requested");
    setTimeout(() => process.exit(0), 100);
    return c.json({ success: true });
  });

  // Media upload
  app.post("/upload", async (c) => {
    try {
      const formData = await c.req.formData();
      const file = formData.get("file") as File | null;

      if (!file) {
        return c.json({ error: "No file provided" }, 400);
      }

      const allowedTypes = ["image/", "video/", "audio/"];
      const isMedia = allowedTypes.some((type) => file.type.startsWith(type));
      if (!isMedia) {
        return c.json({ error: "Only image, video, and audio files are allowed" }, 400);
      }

      const publicDir = join(config.workbookDir, "public");
      if (!existsSync(publicDir)) {
        const { mkdirSync } = await import("node:fs");
        mkdirSync(publicDir, { recursive: true });
      }

      const ext = file.name.split(".").pop() || "";
      const timestamp = Date.now();
      const randomId = Math.random().toString(36).substring(2, 8);
      const safeOriginalName = file.name
        .replace(/\.[^/.]+$/, "")
        .replace(/[^a-zA-Z0-9-_]/g, "-")
        .substring(0, 50);
      const filename = `${safeOriginalName}-${timestamp}-${randomId}.${ext}`;

      const filePath = join(publicDir, filename);
      const buffer = await file.arrayBuffer();
      const { writeFileSync } = await import("node:fs");
      writeFileSync(filePath, Buffer.from(buffer));

      console.log(`[server] Uploaded: ${filename} (${file.type}, ${file.size} bytes)`);

      return c.json({
        url: `/public/${filename}`,
        name: file.name,
        size: file.size,
        type: file.type,
      });
    } catch (err) {
      console.error("[server] Upload failed:", err);
      return c.json({ error: "Upload failed" }, 500);
    }
  });

  // Serve public/ directory
  app.get("/public/*", async (c) => {
    const filePath = c.req.path.replace("/public/", "");
    const fullPath = join(config.workbookDir, "public", filePath);

    if (!existsSync(fullPath)) {
      return c.json({ error: "File not found" }, 404);
    }

    try {
      const { readFileSync } = await import("node:fs");
      const content = readFileSync(fullPath);

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
      console.error("[server] Failed to serve file:", err);
      return c.json({ error: "Failed to serve file" }, 500);
    }
  });

  // tRPC routes
  registerTRPCRoutes(app, {
    workbookId: config.workbookId,
    workbookDir: config.workbookDir,
    getRuntimeUrl: () => null, // No runtime server
    getState: () => ({
      rscReady: false,
      rscPort: null,
      rscError: null,
      buildErrors: [],
    }),
    getExternalConfig: async () => getConfig(config.workbookDir),
    formatBlockSource: (filePath: string) => formatBlockSource(filePath, config.workbookDir),
    generateDefaultBlockSource,
    onSchemaChange: async () => {
      console.log("[server] Schema changed");
    },
    getPageRegistry: () => state.pageRegistry,
    createPageRegistry: (pagesDir: string) => {
      state.pageRegistry = createPageRegistry({ pagesDir, precompile: false });
      return state.pageRegistry;
    },
  });

  return app;
}

/**
 * Boot page registry
 */
async function bootPages(workbookDir: string) {
  const pagesDir = join(workbookDir, "pages");

  if (!existsSync(pagesDir)) {
    console.log("[server] No pages/ directory found");
    return;
  }

  console.log(`[server] Loading pages from ${pagesDir}...`);

  try {
    state.pageRegistry = createPageRegistry({
      pagesDir,
      precompile: false,
    });

    const result = await state.pageRegistry.load();
    console.log(`[server] Loaded ${result.pages.length} pages`);

    if (result.errors.length > 0) {
      console.warn("[server] Page errors:");
      for (const err of result.errors) {
        console.warn(`  - ${err.file}: ${err.error}`);
      }
    }
  } catch (err) {
    console.error("[server] Page registry failed:", err);
  }
}

/**
 * Run the check command
 */
async function runCheck() {
  const args = process.argv.slice(2);
  const restArgs = args.slice(1);

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

  if (!workbookDir.startsWith("/")) {
    workbookDir = join(process.cwd(), workbookDir);
  }

  const { runPreflight, printPreflightResults } = await import("./preflight.js");
  const result = await runPreflight({
    workbookDir,
    autoFix,
    verbose: !jsonOutput,
  });

  if (jsonOutput) {
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
    printPreflightResults(result);
  }

  process.exit(result.ok ? 0 : 1);
}

/**
 * Main entry point
 */
async function main() {
  const firstArg = process.argv[2];
  if (firstArg === "check") {
    await runCheck();
    return;
  }

  const config = parseArgs();
  const { workbookId, workbookDir, port } = config;

  console.log(`[server] Starting workbook: ${workbookId}`);
  console.log(`[server] Workbook dir: ${workbookDir}`);

  const app = createApp(config);

  let server: ReturnType<typeof Bun.serve>;

  const startServer = async (retried = false) => {
    try {
      server = Bun.serve({
        port,
        fetch: app.fetch,
        error(error) {
          console.error("[server] Request error:", error);
          return new Response("Internal Server Error", { status: 500 });
        },
      });

      console.log(`[server] Ready on http://localhost:${port}`);
    } catch (err: any) {
      if (err?.code === "EADDRINUSE" && !retried) {
        console.error(`[server] Port ${port} in use, attempting to free it...`);
        const { killProcessOnPort } = await import("./ports.js");
        await killProcessOnPort(port);
        await new Promise((resolve) => setTimeout(resolve, 1000));
        await startServer(true);
      } else {
        console.error(`[server] Server error:`, err);
        process.exit(1);
      }
    }
  };

  await startServer();

  // Boot pages
  await bootPages(workbookDir);

  // Output ready JSON for Tauri
  console.log(
    JSON.stringify({
      type: "ready",
      runtimePort: port,
    }),
  );

  // Start file watcher
  startFileWatcher(config);

  // Handle shutdown
  const shutdown = async () => {
    console.log("[server] Shutting down...");
    stopScheduler();
    for (const watcher of state.fileWatchers) {
      watcher.close();
    }
    closeAllWorkbookDbs();
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
