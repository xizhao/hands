#!/usr/bin/env bun

/**
 * Hands Workbook Server
 *
 * Lightweight server for workbook operations with direct SQLite database access.
 *
 * Usage:
 *   hands-workbook-server --workbook-id=<id> --workbook-dir=<dir> [--port=<port>]
 *   hands-workbook-server check <workbook-dir> [--json] [--strict]
 */

import { gateway } from "@ai-sdk/gateway";
import { generateText } from "ai";
import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  existsSync,
  type FSWatcher,
  readdirSync,
  readFileSync,
  watch,
} from "node:fs";
import { join } from "node:path";
import { stopScheduler } from "./actions/index.js";
import { closeWorkbookDb, getWorkbookDb, getSchema } from "./db/workbook-db.js";
import { getRuntimeSourcePath } from "./config/index.js";
import { createPageRegistry, PageRegistry } from "./pages/index.js";
import { PORTS, waitForPortFree } from "./ports.js";
import { getDbSubscriptionManager } from "./sqlite/trpc.js";
import { registerTRPCRoutes } from "./trpc/index.js";

interface RuntimeConfig {
  workbookId: string;
  workbookDir: string;
  port: number;
}

interface RuntimeState {
  fileWatchers: FSWatcher[];
  buildErrors: string[];
  pageRegistry: PageRegistry | null;
}

// Global state
const state: RuntimeState = {
  buildErrors: [],
  fileWatchers: [],
  pageRegistry: null,
};

/**
 * Format a block source file with Biome + TypeScript import organization
 */
async function formatBlockSource(
  filePath: string,
  workbookDir: string
): Promise<boolean> {
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
    const globalBiomePath = join(
      import.meta.dirname,
      "..",
      "node_modules",
      ".bin",
      "biome"
    );
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
            javascript: {
              formatter: { semicolons: "asNeeded", quoteStyle: "single" },
            },
          },
          null,
          2
        )
      );
    }

    spawnSync(biomeCmd, ["check", "--write", filePath], { cwd: workbookDir });
    return true;
  } catch (err) {
    console.error("[server] Format failed:", err);
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
      "Usage: hands-workbook-server --workbook-id=<id> --workbook-dir=<dir> [--port=<port>]"
    );
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
 * Recursively walk a directory and call callback for each file
 */
function walkDirectory(
  dir: string,
  baseDir: string,
  callback: (filePath: string, relativePath: string) => void
) {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    const relativePath = fullPath.substring(baseDir.length + 1);
    if (entry.isDirectory()) {
      if (!entry.name.startsWith(".") && entry.name !== "node_modules") {
        walkDirectory(fullPath, baseDir, callback);
      }
    } else {
      callback(fullPath, relativePath);
    }
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
    if (
      (filename.endsWith(".tsx") || filename.endsWith(".ts")) &&
      !filename.startsWith("_")
    ) {
      const id = relativePath.replace(/\.tsx?$/, "");
      blockIds.add(id);
    }
  });

  return blockIds;
}

// Track known block IDs
let knownBlockIds: Set<string> = new Set();

/**
 * Start watching blocks/ and pages/ directories for changes
 */
function startFileWatcher(config: RuntimeConfig) {
  const { workbookDir } = config;
  const blocksDir = join(workbookDir, "blocks");

  // Initialize known block IDs
  knownBlockIds = getBlockIds(blocksDir);
  console.log(
    `[server] Initial blocks: ${[...knownBlockIds].join(", ") || "(none)"}`
  );

  // Watch blocks directory
  if (existsSync(blocksDir)) {
    try {
      const watcher = watch(
        blocksDir,
        { recursive: true },
        async (_event, filename) => {
          if (
            filename &&
            (filename.endsWith(".ts") || filename.endsWith(".tsx"))
          ) {
            if (filename.endsWith(".types.ts")) return;

            const currentBlockIds = getBlockIds(blocksDir);
            const added = [...currentBlockIds].filter(
              (id) => !knownBlockIds.has(id)
            );
            const removed = [...knownBlockIds].filter(
              (id) => !currentBlockIds.has(id)
            );

            if (added.length > 0 || removed.length > 0) {
              if (added.length > 0)
                console.log(`[server] Blocks added: ${added.join(", ")}`);
              if (removed.length > 0)
                console.log(`[server] Blocks removed: ${removed.join(", ")}`);
              knownBlockIds = currentBlockIds;
            }
          }
        }
      );
      state.fileWatchers.push(watcher);
      console.log("[server] Watching blocks/ for changes");
    } catch (err) {
      console.warn("[server] Could not watch blocks/:", err);
    }
  }

  // Watch pages directory
  const pagesDir = join(workbookDir, "pages");
  if (existsSync(pagesDir)) {
    try {
      const pagesWatcher = watch(
        pagesDir,
        { recursive: true },
        async (_event, filename) => {
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
        }
      );
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

  // CORS
  app.use("/*", cors());

// Health endpoint
  app.get("/health", (c) => {
    return c.json({ ready: true, status: "ready" });
  });

  // Database Change Subscription (SSE)
  app.get("/db/subscribe", async (c) => {
    const manager = getDbSubscriptionManager(config.workbookDir);
    const stream = manager.createStream();

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
      },
    });
  });

  // Stop endpoint for graceful shutdown
  app.post("/stop", async (c) => {
    console.log("[server] Stop requested via /stop endpoint");
    setTimeout(() => process.exit(0), 100);
    return c.json({ success: true });
  });

  // Media Upload
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
        return c.json(
          { error: "Only image, video, and audio files are allowed" },
          400
        );
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

      console.log(
        `[server] Uploaded media: ${filename} (${file.type}, ${file.size} bytes)`
      );

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

  // AI Copilot Route
  app.post("/api/ai/copilot", async (c) => {
    try {
      const body = await c.req.json();
      let { prompt } = body;
      let prefix = body.prefix;
      let suffix = body.suffix;

      let title: string | undefined;
      let description: string | undefined;
      if (prompt && prefix === undefined) {
        try {
          const parsed = JSON.parse(prompt);
          if (parsed.prefix !== undefined) {
            prefix = parsed.prefix;
            suffix = parsed.suffix ?? "";
            title = parsed.title;
            description = parsed.description;
            prompt = null;
          }
        } catch {
          // Not JSON, use as regular prompt
        }
      }

      const apiKey = process.env.HANDS_AI_API_KEY;
      if (!apiKey) {
        console.error("[copilot] HANDS_AI_API_KEY not set");
        return c.json({ error: "HANDS_AI_API_KEY not set" }, 500);
      }
      process.env.AI_GATEWAY_API_KEY = apiKey;

      // Fetch schema from local database
      let schema: Array<{
        table_name: string;
        columns: Array<{ name: string; type: string; nullable: boolean }>;
      }> = [];
      try {
        const db = getWorkbookDb(config.workbookDir);
        const schemaResult = getSchema(db);
        schema = schemaResult.tables.map((t) => ({
          table_name: t.name,
          columns: t.columns.map((col) => ({
            name: col.name,
            type: col.type,
            nullable: col.nullable,
          })),
        }));
      } catch {
        // Schema fetch failed - proceed without it
      }

      const systemPrompt = `You are a precision MDX autocompletion engine for a data dashboard.

## Output Rules
- Output ONLY the completion text, nothing else.
- NEVER wrap in markdown code blocks.
- NEVER explain or add filler.
- CRITICAL: If you start an MDX tag like <LiveValue or <LiveQuery, you MUST complete the ENTIRE tag including the closing />. Never leave tags incomplete.
- Match the style and tone of the existing content.

## MDX Components

### LiveValue (inline) - for single values in text
<LiveValue query="SELECT COUNT(*) FROM users" />

### LiveQuery (block) - for tables/lists
<LiveQuery query="SELECT * FROM table" columns="auto" />

## Rules
- Use LiveValue for counts, totals, single metrics inline.
- Use LiveQuery with columns="auto" for tables.
- SQL must be valid for the provided schema.
- Return "0" if no sensible completion.`;

      const schemaContext =
        schema.length > 0
          ? schema
              .map(
                (t) =>
                  `${t.table_name}(${t.columns.map((c) => c.name).join(", ")})`
              )
              .join("\n")
          : "No tables yet";

      const pageContext =
        title || description
          ? `## Page\nTitle: ${title || "Untitled"}\n${
              description ? `Description: ${description}\n` : ""
            }`
          : "";

      const userPrompt =
        prefix !== undefined
          ? `## Schema
${schemaContext}

${pageContext}## Complete this (fill in <middle>):
<prefix>
${prefix.slice(-300)}
</prefix>
<suffix>
${(suffix || "").slice(0, 100)}
</suffix>
<middle>`
          : prompt;

      if (!userPrompt) {
        return c.json({ error: "Missing prompt or prefix" }, 400);
      }

      console.log(`[copilot] API key ends with: ...${apiKey.slice(-6)}`);

      const start = performance.now();
      const result = await generateText({
        model: gateway("google/gemini-2.5-flash-lite"),
        system: systemPrompt,
        prompt: userPrompt,
        maxOutputTokens: 400,
        temperature: 0,
        abortSignal: AbortSignal.timeout(10000),
      });
      const latency = performance.now() - start;
      console.log(`[copilot] Latency: ${latency.toFixed(0)}ms`);

      return c.json({ text: result.text || "" });
    } catch (err) {
      console.error("[copilot] Error:", err);
      return c.json({ error: String(err) }, 500);
    }
  });

  // tRPC Routes
  registerTRPCRoutes(app, {
    workbookId: config.workbookId,
    workbookDir: config.workbookDir,
    getState: () => ({
      buildErrors: state.buildErrors,
    }),
    getExternalConfig: async () => getConfig(config.workbookDir),
    formatBlockSource: (filePath: string) =>
      formatBlockSource(filePath, config.workbookDir),
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
 * Boot page registry for MDX pages
 */
async function bootPages(workbookDir: string) {
  const pagesDir = join(workbookDir, "pages");

  if (!existsSync(pagesDir)) {
    console.log("[server] No pages/ directory found, skipping page registry");
    return;
  }

  console.log(`[server] Booting page registry for ${pagesDir}...`);

  try {
    state.pageRegistry = createPageRegistry({
      pagesDir,
      precompile: false,
    });

    const result = await state.pageRegistry.load();
    console.log(`[server] Page registry ready: ${result.pages.length} pages`);

    if (result.errors.length > 0) {
      console.warn("[server] Page discovery errors:");
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

  const { runPreflight, printPreflightResults } = await import(
    "./preflight.js"
  );
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
        2
      )
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

  // Initialize database (this creates it if needed)
  getWorkbookDb(workbookDir);
  console.log(`[server] Database ready at ${workbookDir}/.hands/workbook.db`);

  // Start HTTP server
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

      console.log(
        `[server] Server ready on http://localhost:${port}${
          retried ? " (after retry)" : ""
        }`
      );
    } catch (err: any) {
      if (err?.code === "EADDRINUSE" && !retried) {
        console.error(
          `[server] Port ${port} in use, attempting to free it...`
        );
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
  bootPages(workbookDir);

  // Output ready JSON for Tauri
  console.log(
    JSON.stringify({
      type: "ready",
      runtimePort: port,
    })
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
    closeWorkbookDb(workbookDir);
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
