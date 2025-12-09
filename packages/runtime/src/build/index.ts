/**
 * Build system for workbooks
 *
 * Generates .hands/wrangler.toml and .hands/worker.ts from:
 * - hands.json configuration
 * - pages/ directory (markdown with MDX blocks)
 * - blocks/ directory (RSC functions)
 * - sources/ directory (data connectors)
 *
 * Uses unenv polyfills for Node.js compatibility in Cloudflare Workers/Miniflare.
 * Uses esbuild directly instead of Bun.build() to avoid Bun 1.3.3 segfault.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { join, dirname } from "path"
import { nodeless } from "unenv"
import { build as esbuild, type Plugin } from "esbuild"
import { discoverPages } from "../pages/discovery.js"
import { discoverBlocks } from "../blocks/discovery.js"

/**
 * Find stdlib path for build-time resolution
 */
function findStdlibPath(): string | null {
  let current = dirname(dirname(dirname(import.meta.dir)))
  for (let i = 0; i < 10; i++) {
    const pkgPath = join(current, "package.json")
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"))
        if (pkg.workspaces) {
          const stdlibPath = join(current, "packages", "stdlib")
          if (existsSync(join(stdlibPath, "package.json"))) {
            return stdlibPath
          }
        }
      } catch {}
    }
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }
  return null
}

export interface BuildOptions {
  /** Development mode (adds dev settings to wrangler.toml) */
  dev?: boolean
  /** Verbose output */
  verbose?: boolean
}

export interface BuildResult {
  success: boolean
  outputDir: string
  files: string[]
  errors: string[]
  /** Discovered pages */
  pages?: Array<{ route: string; path: string }>
  /** Discovered blocks */
  blocks?: Array<{ id: string; path: string }>
}

export interface HandsConfig {
  $schema?: string
  name: string
  version?: string
  pages?: {
    dir?: string
  }
  blocks?: {
    dir?: string
    include?: string[]
    exclude?: string[]
  }
  sources?: Record<string, {
    enabled?: boolean
    schedule?: string
    options?: Record<string, unknown>
  }>
  secrets?: Record<string, {
    required?: boolean
    description?: string
  }>
  database?: {
    migrations?: string
  }
  build?: {
    outDir?: string
    external?: string[]
  }
  dev?: {
    port?: number
    hmr?: boolean
  }
}

/**
 * Build a workbook from hands.json
 */
export async function build(
  workbookDir: string,
  options: BuildOptions = {}
): Promise<BuildResult> {
  const errors: string[] = []
  const files: string[] = []
  let outputDir = join(workbookDir, ".hands")

  try {
    // Read hands.json
    const handsJsonPath = join(workbookDir, "hands.json")
    if (!existsSync(handsJsonPath)) {
      return {
        success: false,
        outputDir,
        files: [],
        errors: [`No hands.json found in ${workbookDir}`],
      }
    }

    const config: HandsConfig = JSON.parse(
      readFileSync(handsJsonPath, "utf-8")
    )

    // Update output dir from config
    outputDir = join(workbookDir, config.build?.outDir || ".hands")

    // Ensure output directory exists
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true })
    }

    // Discover pages
    const pagesDir = join(workbookDir, config.pages?.dir || "./pages")
    const pagesResult = await discoverPages(pagesDir)

    if (pagesResult.errors.length > 0) {
      for (const err of pagesResult.errors) {
        errors.push(`Page error (${err.file}): ${err.error}`)
      }
    }

    if (options.verbose) {
      console.log(`Found ${pagesResult.pages.length} pages`)
      for (const page of pagesResult.pages) {
        console.log(`  ${page.route} -> ${page.path}`)
      }
    }

    // Discover blocks
    const blocksDir = join(workbookDir, config.blocks?.dir || "./blocks")
    const blocksResult = await discoverBlocks(blocksDir, {
      include: config.blocks?.include,
      exclude: config.blocks?.exclude,
    })

    if (blocksResult.errors.length > 0) {
      for (const err of blocksResult.errors) {
        errors.push(`Block error (${err.file}): ${err.error}`)
      }
    }

    if (options.verbose) {
      console.log(`Found ${blocksResult.blocks.length} blocks`)
      for (const block of blocksResult.blocks) {
        console.log(`  ${block.id} -> ${block.path}`)
      }
    }

    // Generate wrangler.toml
    const wranglerToml = generateWranglerToml(config, options)
    const wranglerPath = join(outputDir, "wrangler.toml")
    writeFileSync(wranglerPath, wranglerToml)
    files.push("wrangler.toml")

    // Generate worker.ts source
    const workerTs = generateWorkerEntry(
      workbookDir,
      config,
      pagesResult.pages,
      blocksResult.blocks
    )
    const workerSrcPath = join(outputDir, "worker.src.ts")
    writeFileSync(workerSrcPath, workerTs)

    // Bundle to worker.js (Miniflare needs JS, not TS)
    // Uses esbuild directly to avoid Bun 1.3.3 segfault with Bun.build()
    const stdlibPath = findStdlibPath()

    // Get unenv aliases for Node.js polyfills
    // This maps node:os -> unenv/runtime/node/os/index, etc.
    const unenvAliases = nodeless.alias

    // esbuild plugin to resolve npm packages using require.resolve
    // This is needed because esbuild doesn't understand Bun's .bun folder structure
    const npmResolverPlugin: Plugin = {
      name: "npm-resolver",
      setup(build) {
        // Match bare imports (no . or / prefix, not node: prefix)
        build.onResolve({ filter: /^[^./]/ }, async (args) => {
          // Skip node: imports, cloudflare: imports, and already-resolved paths
          if (args.path.startsWith("node:") ||
              args.path.startsWith("cloudflare:") ||
              args.path.startsWith("/")) {
            return undefined
          }

          // Check if it's a Node.js builtin that should be polyfilled
          const moduleName = args.path.split("/")[0]
          const nodeKey = `node:${moduleName}`
          const alias = unenvAliases[nodeKey] || unenvAliases[moduleName]

          if (alias) {
            // This is a Node.js builtin, resolve via unenv
            try {
              const resolved = require.resolve(alias)
              return { path: resolved, external: false }
            } catch {
              return undefined
            }
          }

          // Try to resolve as npm package
          try {
            const resolved = require.resolve(args.path)
            return { path: resolved, external: false }
          } catch {
            return undefined
          }
        })
      }
    }

    // esbuild plugin to resolve @hands/stdlib to local path
    const stdlibPlugin: Plugin = {
      name: "stdlib-resolver",
      setup(build) {
        build.onResolve({ filter: /^@hands\/stdlib/ }, (args) => {
          if (!stdlibPath) return undefined
          const subpath = args.path.replace("@hands/stdlib", "")
          return { path: join(stdlibPath, "src", subpath || "index.ts") }
        })
      }
    }

    try {
      const result = await esbuild({
        entryPoints: [workerSrcPath],
        outfile: join(outputDir, "worker.js"),
        platform: "browser",  // Target browser/workerd - no native Node.js
        format: "esm",
        bundle: true,
        minify: false,
        sourcemap: options.dev ? "inline" : false,
        // Only cloudflare namespace is external - Node.js builtins are polyfilled
        external: ["cloudflare:*"],
        plugins: [
          npmResolverPlugin,
          ...(stdlibPath ? [stdlibPlugin] : []),
        ],
        logLevel: "warning",
      })

      if (result.errors.length > 0) {
        for (const err of result.errors) {
          errors.push(err.text)
        }
      } else {
        files.push("worker.js")
        if (options.verbose) {
          console.log("Bundled worker.js with unenv polyfills (esbuild)")
        }
      }
    } catch (err) {
      console.error("Bundle error details:", err)
      errors.push(`Bundle error: ${err instanceof Error ? err.message : String(err)}`)
    }

    // Generate .gitignore
    const gitignorePath = join(outputDir, ".gitignore")
    writeFileSync(gitignorePath, "# Auto-generated - do not commit\n*\n")
    files.push(".gitignore")

    return {
      success: errors.length === 0,
      outputDir,
      files,
      errors,
      pages: pagesResult.pages.map((p) => ({ route: p.route, path: p.path })),
      blocks: blocksResult.blocks.map((b) => ({ id: b.id, path: b.path })),
    }
  } catch (error) {
    return {
      success: false,
      outputDir,
      files,
      errors: [error instanceof Error ? error.message : String(error)],
    }
  }
}

/**
 * Generate wrangler.toml from config
 */
function generateWranglerToml(config: HandsConfig, options: BuildOptions): string {
  const name = config.name || "workbook"
  const isDev = options.dev ?? false

  const lines = [
    "# Generated by hands build system - do not edit directly",
    `name = "${name}"`,
    `compatibility_date = "2025-08-15"`,
    `compatibility_flags = ["nodejs_compat"]`,
    `main = "worker.js"`,
    "",
    "[vars]",
    "# DATABASE_URL is set at runtime by the dev server",
  ]

  // Add source schedules as triggers
  const sources = config.sources || {}
  const enabledSources = Object.entries(sources).filter(
    ([_, s]) => s.enabled !== false && s.schedule
  )

  if (enabledSources.length > 0) {
    lines.push("")
    lines.push("[triggers]")
    const crons = enabledSources.map(([_, s]) => `"${s.schedule}"`)
    lines.push(`crons = [${crons.join(", ")}]`)
  }

  if (isDev) {
    lines.push("")
    lines.push("[dev]")
    lines.push(`local_protocol = "http"`)
  }

  return lines.join("\n") + "\n"
}

/**
 * Generate worker.ts entry point from pages and blocks
 */
function generateWorkerEntry(
  workbookDir: string,
  config: HandsConfig,
  pages: Array<{ route: string; path: string }>,
  blocks: Array<{ id: string; path: string }>
): string {
  const pagesDir = config.pages?.dir || "./pages"
  const blocksDir = config.blocks?.dir || "./blocks"

  // Read page contents at build time and embed them
  // This is CF Workers compatible (no Bun.file at runtime)
  const pageContents: Record<string, string> = {}
  for (const page of pages) {
    const pagePath = join(workbookDir, pagesDir, page.path)
    if (existsSync(pagePath)) {
      pageContents[page.route] = readFileSync(pagePath, "utf-8")
    }
  }

  // Generate page content object
  const pageContentEntries = Object.entries(pageContents)
    .map(([route, content]) => {
      // Escape backticks and ${} in content
      const escaped = content.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${")
      return `  "${route}": \`${escaped}\``
    })
    .join(",\n")

  // Generate page routes
  const pageRoutes = pages.map((page) => {
    return `
  // Page: ${page.path}
  app.get("${page.route}", async (c) => {
    const content = PAGE_CONTENTS["${page.route}"];
    const html = await renderPage(content, {
      db: createDb(c.env.DATABASE_URL),
      env: c.env,
      params: c.req.param(),
    });
    return c.html(html);
  });`
  }).join("\n")

  // Generate block routes
  const blockRoutes = blocks.map((block) => {
    const importPath = `../${blocksDir}/${block.path}`
    return `
  // Block: ${block.id}
  app.get("/blocks/${block.id}", async (c) => {
    const { default: BlockFn, meta } = await import("${importPath}");
    const props = Object.fromEntries(new URL(c.req.url).searchParams);
    const ctx = createBlockContext(c.env.DATABASE_URL, c.env, c.req.param());
    const element = await BlockFn(props, ctx);
    return c.html(renderToString(element));
  });

  app.post("/blocks/${block.id}", async (c) => {
    const { default: BlockFn } = await import("${importPath}");
    const props = await c.req.json();
    const ctx = createBlockContext(c.env.DATABASE_URL, c.env, c.req.param());
    const element = await BlockFn(props, ctx);
    return c.html(renderToString(element));
  });`
  }).join("\n")

  // Generate block metadata endpoint
  const blocksMeta = blocks.map((b) => `    "${b.id}": { path: "${b.path}" }`).join(",\n")

  return `// Generated by hands build system - do not edit directly
// Regenerate with: hands build

import { Hono } from "hono";
import { cors } from "hono/cors";
import * as React from "react";
import { renderToString } from "react-dom/server.edge";
import postgres from "postgres";

type Bindings = {
  DATABASE_URL: string;
  ENVIRONMENT: string;
};

// Page contents (embedded at build time for CF Workers compatibility)
const PAGE_CONTENTS: Record<string, string> = {
${pageContentEntries}
};

const app = new Hono<{ Bindings: Bindings }>();

// Enable CORS
app.use("/*", cors());

// Health check
app.get("/health", (c) => {
  return c.json({ status: "ok", name: "${config.name}" });
});

// Block metadata
app.get("/blocks", (c) => {
  return c.json({
${blocksMeta}
  });
});
${pageRoutes}
${blockRoutes}

// 404 fallback
app.all("*", (c) => c.notFound());

export default app;

// === Helpers ===

function createDb(connectionString: string) {
  const sql = postgres(connectionString, {
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
  });

  const client = async function(strings: TemplateStringsArray, ...values: unknown[]) {
    return await sql(strings, ...values);
  } as any;

  client.unsafe = async (query: string, params?: unknown[]) => {
    return await sql.unsafe(query, params);
  };

  return client;
}

function createBlockContext(databaseUrl: string, env: Record<string, string>, params: Record<string, string>) {
  return {
    db: createDb(databaseUrl),
    env,
    params,
  };
}

async function renderPage(content: string, ctx: any) {
  // Simple markdown rendering
  // TODO: Use full MDX compilation with block rendering
  let html = content;

  // Remove frontmatter
  if (html.startsWith("---")) {
    const endIndex = html.indexOf("---", 3);
    if (endIndex !== -1) {
      html = html.slice(endIndex + 3).trim();
    }
  }

  // Basic markdown
  html = html
    .replace(/^### (.*$)/gm, "<h3>$1</h3>")
    .replace(/^## (.*$)/gm, "<h2>$1</h2>")
    .replace(/^# (.*$)/gm, "<h1>$1</h1>")
    .replace(/\\*\\*(.*)\\*\\*/g, "<strong>$1</strong>")
    .replace(/\\*(.*)\\*/g, "<em>$1</em>");

  return \`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="prose max-w-4xl mx-auto p-8">
  \${html}
</body>
</html>\`;
}
`
}
