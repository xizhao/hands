/**
 * Production Build System
 *
 * Generates optimized production builds with:
 * - Static pre-rendering of pages using PlateStatic
 * - Minified and tree-shaken bundles
 * - Static assets for CF Workers Sites or KV
 * - Optimized worker for dynamic routes only
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { build as esbuild, type Plugin } from "esbuild";
import { nodeless } from "unenv";
import { discoverBlocks, discoverPages } from "../workbook/discovery.js";
import type { BuildResult, HandsConfig } from "./index.js";
import {
  type PageDocument,
  parseMarkdownDocument,
  parsePlateDocument,
  renderPageToHtml,
} from "./static-render.js";

export interface ProductionBuildOptions {
  /** Verbose output */
  verbose?: boolean;
  /** Skip static pre-rendering (all SSR at runtime) */
  skipPrerender?: boolean;
  /** Custom output directory */
  outDir?: string;
}

export interface ProductionBuildResult extends BuildResult {
  /** Pre-rendered static pages */
  staticPages?: Array<{ route: string; file: string }>;
  /** Bundle size stats */
  stats?: {
    workerSize: number;
    staticSize: number;
    totalSize: number;
  };
}

/**
 * Find stdlib path for build-time resolution
 */
function findStdlibPath(): string | null {
  let current = dirname(dirname(dirname(import.meta.dir)));
  for (let i = 0; i < 10; i++) {
    const pkgPath = join(current, "package.json");
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
        if (pkg.workspaces) {
          const stdlibPath = join(current, "packages", "stdlib");
          if (existsSync(join(stdlibPath, "package.json"))) {
            return stdlibPath;
          }
        }
      } catch {}
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

/**
 * Build for production deployment
 */
export async function buildProduction(
  workbookDir: string,
  options: ProductionBuildOptions = {},
): Promise<ProductionBuildResult> {
  const errors: string[] = [];
  const files: string[] = [];
  const staticPages: Array<{ route: string; file: string }> = [];

  // Read config from package.json
  const pkgJsonPath = join(workbookDir, "package.json");
  if (!existsSync(pkgJsonPath)) {
    return {
      success: false,
      outputDir: "",
      files: [],
      errors: [`No package.json found in ${workbookDir}`],
    };
  }

  const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf-8"));
  const config: HandsConfig = { name: pkg.name?.replace(/^@hands\//, "") || "workbook", ...pkg.hands };
  const outputDir = join(workbookDir, options.outDir || config.build?.outDir || "dist");

  try {
    // Clean and create output directories
    if (existsSync(outputDir)) {
      const { rmSync } = await import("node:fs");
      rmSync(outputDir, { recursive: true });
    }
    mkdirSync(outputDir, { recursive: true });
    mkdirSync(join(outputDir, "_static"), { recursive: true });

    if (options.verbose) {
      console.log(`Building production bundle in ${outputDir}`);
    }

    // Discover pages and blocks
    const pagesDir = join(workbookDir, config.pages?.dir || "./pages");
    const blocksDir = join(workbookDir, config.blocks?.dir || "./blocks");

    const pagesResult = await discoverPages(pagesDir);
    const blocksResult = await discoverBlocks(blocksDir, {
      exclude: config.blocks?.exclude,
    });

    if (pagesResult.errors.length > 0) {
      for (const err of pagesResult.errors) {
        errors.push(`Page error (${err.file}): ${err.error}`);
      }
    }

    if (blocksResult.errors.length > 0) {
      for (const err of blocksResult.errors) {
        errors.push(`Block error (${err.file}): ${err.error}`);
      }
    }

    if (options.verbose) {
      console.log(`Found ${pagesResult.items.length} pages, ${blocksResult.items.length} blocks`);
    }

    // Analyze pages to determine which can be pre-rendered
    const staticPageRoutes: string[] = [];
    const dynamicPageRoutes: string[] = [];

    for (const page of pagesResult.items) {
      const pagePath = join(workbookDir, config.pages?.dir || "./pages", page.path);
      const content = readFileSync(pagePath, "utf-8");

      // Check if page has dynamic blocks (SQL queries, etc.)
      const hasDynamicContent =
        content.includes("<Block") &&
        (content.includes("sql") || content.includes("query") || content.includes("fetch"));

      if (hasDynamicContent || options.skipPrerender) {
        dynamicPageRoutes.push(page.route);
      } else {
        staticPageRoutes.push(page.route);
      }
    }

    if (options.verbose) {
      console.log(
        `Static pages: ${staticPageRoutes.length}, Dynamic pages: ${dynamicPageRoutes.length}`,
      );
    }

    // Pre-render static pages
    if (!options.skipPrerender && staticPageRoutes.length > 0) {
      if (options.verbose) {
        console.log("Pre-rendering static pages...");
      }

      for (const route of staticPageRoutes) {
        const page = pagesResult.items.find((p) => p.route === route);
        if (!page) continue;

        const pagePath = join(workbookDir, config.pages?.dir || "./pages", page.path);
        const content = readFileSync(pagePath, "utf-8");

        // Pre-render to HTML using the static renderer
        const html = await prerenderPage(page.path, content, config);

        // Write static file
        const staticFileName = route === "/" ? "index.html" : `${route.slice(1)}.html`;
        const staticPath = join(outputDir, "_static", staticFileName);

        // Ensure directory exists for nested routes
        const staticDir = dirname(staticPath);
        if (!existsSync(staticDir)) {
          mkdirSync(staticDir, { recursive: true });
        }

        writeFileSync(staticPath, html);
        staticPages.push({ route, file: staticFileName });

        if (options.verbose) {
          console.log(`  Pre-rendered: ${route} -> _static/${staticFileName}`);
        }
      }
    }

    // Generate optimized worker
    const workerTs = generateProductionWorker(
      workbookDir,
      config,
      pagesResult.items,
      blocksResult.items,
      staticPageRoutes,
    );
    const workerSrcPath = join(outputDir, "worker.src.ts");
    writeFileSync(workerSrcPath, workerTs);

    // Bundle with optimizations using esbuild (avoid Bun 1.3.3 segfault)
    const stdlibPath = findStdlibPath();
    const unenvAliases = nodeless.alias;

    if (options.verbose) {
      console.log("Bundling worker with optimizations (esbuild)...");
    }

    // esbuild plugin to resolve Node.js builtins to unenv polyfills
    const unenvPlugin: Plugin = {
      name: "unenv-polyfills",
      setup(build) {
        build.onResolve({ filter: /^(node:)?[a-z_]+$/ }, async (args) => {
          const moduleName = args.path.replace(/^node:/, "");
          const nodeKey = `node:${moduleName}`;
          const alias = unenvAliases[nodeKey] || unenvAliases[moduleName];

          if (alias) {
            try {
              const resolved = require.resolve(alias);
              return { path: resolved, external: false };
            } catch {
              return undefined;
            }
          }
          return undefined;
        });
      },
    };

    // esbuild plugin to resolve @hands/stdlib
    const stdlibPlugin: Plugin = {
      name: "stdlib-resolver",
      setup(build) {
        build.onResolve({ filter: /^@hands\/stdlib/ }, (args) => {
          if (!stdlibPath) return undefined;
          const subpath = args.path.replace("@hands/stdlib", "");
          return { path: join(stdlibPath, "src", subpath || "index.ts") };
        });
      },
    };

    // esbuild plugin to resolve @hands/db to worker.src.ts
    // The worker exports sql, query, params, env which blocks import
    const handsDbPlugin: Plugin = {
      name: "hands-db-resolver",
      setup(build) {
        build.onResolve({ filter: /^@hands\/db$/ }, () => {
          // Resolve to the worker source file which exports sql, query, params, env
          return { path: workerSrcPath };
        });
      },
    };

    // Find workbook-server's node_modules for dependency resolution
    const workbookServerRoot = dirname(dirname(dirname(import.meta.dir)));
    const workbookServerNodeModules = join(workbookServerRoot, "node_modules");

    const result = await esbuild({
      entryPoints: [workerSrcPath],
      outfile: join(outputDir, "worker.js"),
      platform: "browser",
      format: "esm",
      bundle: true,
      minify: true, // Production: minify
      sourcemap: true, // External sourcemap for debugging
      external: ["cloudflare:*"],
      plugins: [unenvPlugin, handsDbPlugin, ...(stdlibPath ? [stdlibPlugin] : [])],
      nodePaths: [workbookServerNodeModules], // Resolve deps from workbook-server
      logLevel: "warning",
    });

    if (result.errors.length > 0) {
      for (const err of result.errors) {
        errors.push(err.text);
      }
    } else {
      files.push("worker.js");
      files.push("worker.js.map");
    }

    // Generate production wrangler.toml
    const wranglerToml = generateProductionWrangler(config, staticPages.length > 0);
    writeFileSync(join(outputDir, "wrangler.toml"), wranglerToml);
    files.push("wrangler.toml");

    // Generate .gitignore
    writeFileSync(join(outputDir, ".gitignore"), "# Build output\n");

    // Calculate stats
    const workerPath = join(outputDir, "worker.js");
    const workerSize = existsSync(workerPath) ? readFileSync(workerPath).length : 0;

    let staticSize = 0;
    const staticDir = join(outputDir, "_static");
    if (existsSync(staticDir)) {
      const staticFiles = readdirSync(staticDir, { recursive: true }) as string[];
      for (const file of staticFiles) {
        const filePath = join(staticDir, file);
        try {
          const stat = statSync(filePath);
          if (stat.isFile()) {
            staticSize += stat.size;
          }
        } catch {}
      }
    }

    if (options.verbose) {
      console.log(`\nBuild stats:`);
      console.log(`  Worker: ${(workerSize / 1024).toFixed(1)} KB`);
      console.log(`  Static: ${(staticSize / 1024).toFixed(1)} KB`);
      console.log(`  Total:  ${((workerSize + staticSize) / 1024).toFixed(1)} KB`);
    }

    return {
      success: errors.length === 0,
      outputDir,
      files,
      errors,
      pages: pagesResult.items.map((p) => ({ route: p.route, path: p.path })),
      blocks: blocksResult.items.map((b) => ({ id: b.id, path: b.path, parentDir: b.parentDir })),
      staticPages,
      stats: {
        workerSize,
        staticSize,
        totalSize: workerSize + staticSize,
      },
    };
  } catch (error) {
    return {
      success: false,
      outputDir,
      files,
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
}

/**
 * Pre-render a page to static HTML
 *
 * Supports both markdown (.md) and Plate documents (.plate.json)
 */
async function prerenderPage(
  pagePath: string,
  content: string,
  config: HandsConfig,
): Promise<string> {
  let doc: PageDocument;

  if (pagePath.endsWith(".plate.json")) {
    // Parse as Plate document
    const parsed = parsePlateDocument(content);
    if (!parsed) {
      throw new Error(`Failed to parse Plate document: ${pagePath}`);
    }
    doc = parsed;
  } else {
    // Parse as markdown
    doc = parseMarkdownDocument(content);
  }

  // Use the static renderer
  return renderPageToHtml(doc, {
    title: doc.meta.title || config.name,
    description: doc.meta.description,
    includeTailwind: true,
  });
}

/**
 * Generate production worker that serves static files and handles dynamic routes
 */
function generateProductionWorker(
  workbookDir: string,
  config: HandsConfig,
  pages: Array<{ route: string; path: string }>,
  blocks: Array<{ id: string; path: string; parentDir: string }>,
  staticRoutes: string[],
): string {
  const pagesDir = config.pages?.dir || "./pages";
  const blocksDir = config.blocks?.dir || "./blocks";

  // Only include dynamic pages in the worker
  const dynamicPages = pages.filter((p) => !staticRoutes.includes(p.route));

  // Read dynamic page contents
  const pageContents: Record<string, string> = {};
  for (const page of dynamicPages) {
    const pagePath = join(workbookDir, pagesDir, page.path);
    if (existsSync(pagePath)) {
      pageContents[page.route] = readFileSync(pagePath, "utf-8");
    }
  }

  const pageContentEntries = Object.entries(pageContents)
    .map(([route, content]) => {
      const escaped = content.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
      return `  "${route}": \`${escaped}\``;
    })
    .join(",\n");

  // Generate static routes map
  const staticRoutesMap = staticRoutes
    .map((route) => {
      const file = route === "/" ? "index.html" : `${route.slice(1)}.html`;
      return `  "${route}": "_static/${file}"`;
    })
    .join(",\n");

  // Generate dynamic page routes
  const pageRoutes = dynamicPages
    .map((page) => {
      return `
  // Dynamic page: ${page.path}
  app.get("${page.route}", async (c) => {
    const content = PAGE_CONTENTS["${page.route}"];
    const html = await renderPage(content, {
      db: createDb(c.env.DATABASE_URL),
      env: c.env,
      params: c.req.param(),
    });
    return c.html(html);
  });`;
    })
    .join("\n");

  // Generate block imports and registry
  const blockImports = blocks
    .map((block, i) => {
      const importPath = `../${blocksDir}/${block.path}`;
      return `import Block${i} from "${importPath}";`;
    })
    .join("\n");

  const blockRegistry = blocks.map((block, i) => `  "${block.id}": Block${i},`).join("\n");

  const blockMetaRegistry = blocks
    .map((block) => {
      const filename = block.id.includes("/") ? block.id.split("/").pop() : block.id;
      return `  "${block.id}": { path: "${block.path}", parentDir: "${block.parentDir}", title: "${filename}" },`;
    })
    .join("\n");

  return `// Production worker - generated by hands build --production
// Static pages served from _static/, dynamic routes SSR'd at runtime

import { Hono } from "hono";
import { cors } from "hono/cors";
import * as React from "react";
import { renderToString } from "react-dom/server.edge";
import postgres from "postgres";
import { AsyncLocalStorage } from "node:async_hooks";

// ============================================================================
// @hands/db - Database access for server components
// ============================================================================
// Blocks import { sql } from '@hands/db' to query the database.
// ============================================================================

interface DbContext {
  sql<T>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]>;
  query<TParams, TResult>(
    preparedQuery: { run(params: TParams, client: unknown): Promise<TResult[]> },
    params: TParams
  ): Promise<TResult[]>;
}

interface RequestContext {
  db: DbContext;
  params: Record<string, unknown>;
  env: Record<string, unknown>;
}

const requestContext = new AsyncLocalStorage<RequestContext>();

function runWithContext<T>(ctx: RequestContext, fn: () => T): T {
  return requestContext.run(ctx, fn);
}

function getContext(): RequestContext {
  const ctx = requestContext.getStore();
  if (!ctx) {
    throw new Error(
      "[hands] Database can only be accessed during request handling, not at module load time."
    );
  }
  return ctx;
}

/** Tagged template for SQL queries */
export function sql<T = Record<string, unknown>>(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<T[]> {
  return getContext().db.sql<T>(strings, ...values);
}

/** Execute a pgtyped prepared query */
export function query<TParams, TResult>(
  preparedQuery: { run(params: TParams, client: unknown): Promise<TResult[]> },
  params: TParams
): Promise<TResult[]> {
  return getContext().db.query(preparedQuery, params);
}

/** Get URL/form params from the current request */
export function params<T = Record<string, unknown>>(): T {
  return getContext().params as T;
}

/** Get environment bindings */
export function env<T = Record<string, unknown>>(): T {
  return getContext().env as T;
}

${blockImports}

type Bindings = {
  DATABASE_URL: string;
  ENVIRONMENT: string;
  ASSETS?: { fetch: typeof fetch };  // CF Workers Sites
};

// Block registry
const BLOCKS: Record<string, React.FC<any>> = {
${blockRegistry}
};

// Block metadata (path, parentDir, title)
const BLOCK_META: Record<string, { path: string; parentDir: string; title: string }> = {
${blockMetaRegistry}
};

// Static routes (pre-rendered at build time)
const STATIC_ROUTES: Record<string, string> = {
${staticRoutesMap}
};

// Dynamic page contents
const PAGE_CONTENTS: Record<string, string> = {
${pageContentEntries}
};

const app = new Hono<{ Bindings: Bindings }>();

app.use("/*", cors());

// Health check
app.get("/health", (c) => {
  return c.json({ status: "ok", name: "${config.name}", env: "production" });
});

// Block list with metadata
app.get("/blocks", (c) => {
  return c.json({
    blocks: Object.keys(BLOCKS).map(id => ({
      id,
      ...BLOCK_META[id],
    })),
  });
});

// Block wildcard routes (editor-only, supports nested paths like /_editor/blocks/charts/bar-chart)
app.get("/_editor/blocks/*", async (c) => {
  const blockId = c.req.path.replace("/_editor/blocks/", "");
  const Block = BLOCKS[blockId];

  if (!Block) {
    return c.json({ error: "Block not found: " + blockId }, 404);
  }

  const props = Object.fromEntries(new URL(c.req.url).searchParams);
  const requestCtx = {
    db: createDbContext(c.env.DATABASE_URL),
    params: props,
    env: c.env as Record<string, unknown>,
  };

  try {
    const html = await runWithContext(requestCtx, async () => {
      const element = React.createElement(Block, props);
      return renderToString(element);
    });
    return c.html(html);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return c.json({ error }, 500);
  }
});

app.post("/_editor/blocks/*", async (c) => {
  const blockId = c.req.path.replace("/_editor/blocks/", "");
  const Block = BLOCKS[blockId];

  if (!Block) {
    return c.json({ error: "Block not found: " + blockId }, 404);
  }

  const props = await c.req.json();
  const requestCtx = {
    db: createDbContext(c.env.DATABASE_URL),
    params: props,
    env: c.env as Record<string, unknown>,
  };

  try {
    const html = await runWithContext(requestCtx, async () => {
      const element = React.createElement(Block, props);
      return renderToString(element);
    });
    return c.html(html);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return c.json({ error }, 500);
  }
});

// Serve static pre-rendered pages
${
  staticRoutes.length > 0
    ? `
app.get("*", async (c, next) => {
  const path = new URL(c.req.url).pathname;
  const staticFile = STATIC_ROUTES[path];

  if (staticFile && c.env.ASSETS) {
    // Serve from Workers Sites / KV
    return c.env.ASSETS.fetch(new Request(\`\${new URL(c.req.url).origin}/\${staticFile}\`));
  }

  return next();
});
`
    : ""
}
${pageRoutes}

// 404 fallback
app.all("*", (c) => c.notFound());

export default app;

// === Helpers ===

function createDbContext(connectionString: string) {
  const sql = postgres(connectionString, {
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
  });

  return {
    // Tagged template for SQL queries
    sql: async <T = Record<string, unknown>>(
      strings: TemplateStringsArray,
      ...values: unknown[]
    ): Promise<T[]> => {
      const result = await sql(strings, ...values);
      return result as T[];
    },
    // pgtyped PreparedQuery support
    query: async <TParams, TResult>(
      preparedQuery: { run(params: TParams, client: unknown): Promise<TResult[]> },
      params: TParams
    ): Promise<TResult[]> => {
      // Create a pg-compatible client for pgtyped
      const pgClient = {
        query: async (queryText: string, values?: unknown[]) => {
          const result = await sql.unsafe(queryText, values);
          return { rows: result };
        },
      };
      return preparedQuery.run(params, pgClient);
    },
  };
}

async function renderPage(content: string, ctx: any) {
  let html = content;

  if (html.startsWith("---")) {
    const endIndex = html.indexOf("---", 3);
    if (endIndex !== -1) {
      html = html.slice(endIndex + 3).trim();
    }
  }

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
`;
}

/**
 * Generate production wrangler.toml
 */
function generateProductionWrangler(config: HandsConfig, hasStaticAssets: boolean): string {
  const lines = [
    "# Production wrangler.toml - generated by hands build --production",
    `name = "${config.name}"`,
    `compatibility_date = "2025-08-15"`,
    `compatibility_flags = ["nodejs_compat"]`,
    `main = "worker.js"`,
    "",
  ];

  if (hasStaticAssets) {
    lines.push("# Static assets (pre-rendered pages)");
    lines.push("[site]");
    lines.push('bucket = "./_static"');
    lines.push("");
  }

  lines.push("[vars]");
  lines.push('ENVIRONMENT = "production"');
  lines.push("# Set DATABASE_URL in Cloudflare dashboard or via wrangler secret");

  // Add source schedules as triggers
  const sources = config.sources || {};
  const enabledSources = Object.entries(sources).filter(
    ([_, s]) => s.enabled !== false && s.schedule,
  );

  if (enabledSources.length > 0) {
    lines.push("");
    lines.push("[triggers]");
    const crons = enabledSources.map(([_, s]) => `"${s.schedule}"`);
    lines.push(`crons = [${crons.join(", ")}]`);
  }

  return `${lines.join("\n")}\n`;
}
