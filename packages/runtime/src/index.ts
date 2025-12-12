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

import { spawn, type ChildProcess } from "child_process"
import { existsSync, readdirSync, readFileSync, watch, type FSWatcher } from "fs"
import { join } from "path"
import { createServer, type ServerResponse } from "http"
import { Hono } from "hono"
import { cors } from "hono/cors"
import { buildRSC } from "./build/rsc.js"
import { PORTS } from "./ports.js"
import { initWorkbookDb, type WorkbookDb } from "./db/index.js"
import type { BlockContext } from "./ctx.js"
import { registerSourceRoutes, checkMissingSecrets } from "./sources/index.js"
import type { SourceDefinition } from "@hands/stdlib/sources"
import { ensureStdlibSymlink, ensureWorkbookStdlibSymlink, getEditorSourcePath } from "./config/index.js"

interface RuntimeConfig {
  workbookId: string
  workbookDir: string
  port: number
}

interface RuntimeState {
  dbReady: boolean
  viteReady: boolean
  vitePort: number | null
  editorReady: boolean
  editorPort: number | null
  editorProc: ChildProcess | null
  workbookDb: WorkbookDb | null
  viteProc: ChildProcess | null
  fileWatchers: FSWatcher[]
  buildErrors: string[]
  viteError: string | null
}

// Global state for progressive readiness
const state: RuntimeState = {
  dbReady: false,
  viteReady: false,
  vitePort: null,
  editorReady: false,
  editorPort: null,
  editorProc: null,
  workbookDb: null,
  viteProc: null,
  buildErrors: [],
  viteError: null,
  fileWatchers: [],
}

// Parse CLI args
function parseArgs(): RuntimeConfig {
  const args: Record<string, string> = {}

  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--")) {
      const [key, value] = arg.slice(2).split("=")
      args[key.replace(/-/g, "_")] = value
    }
  }

  if (!args.workbook_id || !args.workbook_dir) {
    console.error("Usage: hands-runtime --workbook-id=<id> --workbook-dir=<dir> [--port=<port>]")
    process.exit(1)
  }

  return {
    workbookId: args.workbook_id,
    workbookDir: args.workbook_dir,
    port: args.port ? parseInt(args.port, 10) : PORTS.RUNTIME,
  }
}

/** Source info for manifest */
interface ManifestSource {
  id: string
  name: string
  title: string
  description: string
  schedule?: string
  secrets: string[]
  missingSecrets: string[]
  path: string
  /** Markdown spec describing the source's intent and behavior */
  spec?: string
}

/**
 * Build manifest from filesystem (no DB needed - instant!)
 * Single file walk discovers blocks and sources.
 */
async function getManifest(workbookDir: string, workbookId: string) {
  const blocks: Array<{ id: string; title: string; path: string; parentDir: string }> = []
  const sources: ManifestSource[] = []

  // Read blocks from filesystem (recursive walk)
  const blocksDir = join(workbookDir, "blocks")
  if (existsSync(blocksDir)) {
    walkDirectory(blocksDir, blocksDir, (filePath, relativePath) => {
      const filename = filePath.split("/").pop() || ""
      if ((filename.endsWith(".tsx") || filename.endsWith(".ts")) && !filename.startsWith("_")) {
        // ID is relative path without extension (e.g., "ui/email-events")
        const id = relativePath.replace(/\.tsx?$/, "")
        // parentDir is the directory portion (e.g., "ui" or "" for root)
        const parentDir = relativePath.includes("/")
          ? relativePath.substring(0, relativePath.lastIndexOf("/"))
          : ""
        // Extract title from meta export
        const content = readFileSync(filePath, "utf-8")
        const title = extractBlockTitle(content) || id.split("/").pop() || id
        blocks.push({ id, title, path: relativePath, parentDir })
      }
    })
  }

  // Read sources from filesystem - scan sources/ for directories with index.ts
  const sourcesDir = join(workbookDir, "sources")
  if (existsSync(sourcesDir)) {
    const entries = readdirSync(sourcesDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue

      // Look for index.ts or index.tsx
      const sourceDir = join(sourcesDir, entry.name)
      let indexPath: string | null = null

      for (const filename of ["index.ts", "index.tsx"]) {
        const path = join(sourceDir, filename)
        if (existsSync(path)) {
          indexPath = path
          break
        }
      }

      if (!indexPath) continue

      try {
        // Dynamic import - Bun will handle TypeScript
        const mod = await import(indexPath)
        const definition = mod.default as SourceDefinition<any, any> | undefined

        // Validate it's a proper source definition
        if (definition?.config && typeof definition?.sync === "function") {
          const cfg = definition.config
          const missing = checkMissingSecrets(workbookDir, cfg.secrets)

          sources.push({
            id: entry.name,
            name: cfg.name,
            title: cfg.title,
            description: cfg.description,
            schedule: cfg.schedule,
            secrets: [...cfg.secrets],
            missingSecrets: missing,
            path: indexPath,
            spec: cfg.spec,
          })
        }
      } catch (err) {
        console.error(`[manifest] Failed to load source ${entry.name}:`, err)
      }
    }
  }

  // Read config
  let config: Record<string, any> = {}
  const handsJsonPath = join(workbookDir, "hands.json")
  if (existsSync(handsJsonPath)) {
    try {
      config = JSON.parse(readFileSync(handsJsonPath, "utf-8"))
    } catch {}
  }

  return {
    workbookId,
    workbookDir,
    blocks,
    sources,
    config,
    isEmpty: blocks.length === 0 && sources.length === 0,
  }
}

/**
 * Recursively walk a directory and call callback for each file
 */
function walkDirectory(
  dir: string,
  baseDir: string,
  callback: (filePath: string, relativePath: string) => void
) {
  const entries = readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    const relativePath = fullPath.substring(baseDir.length + 1) // +1 for leading slash
    if (entry.isDirectory()) {
      // Skip hidden directories and node_modules
      if (!entry.name.startsWith(".") && entry.name !== "node_modules") {
        walkDirectory(fullPath, baseDir, callback)
      }
    } else {
      callback(fullPath, relativePath)
    }
  }
}

function extractBlockTitle(content: string): string | null {
  // Look for: export const meta = { title: "..." }
  const metaMatch = content.match(/export\s+const\s+meta\s*=\s*{[\s\S]*?title\s*:\s*["']([^"']+)["']/)
  if (metaMatch) return metaMatch[1]
  return null
}

/**
 * Generate default block source code
 */
function generateDefaultBlockSource(blockId: string): string {
  // Convert blockId to PascalCase for function name
  const functionName = blockId
    .split(/[-_]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join("")

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
`
}

/**
 * Start watching blocks/ directory for changes
 * Uses fs.watch for real-time updates (not polling)
 */
function startFileWatcher(config: RuntimeConfig) {
  const { workbookDir } = config
  const blocksDir = join(workbookDir, "blocks")

  // Watch blocks directory
  if (existsSync(blocksDir)) {
    try {
      const watcher = watch(blocksDir, { recursive: true }, (event, filename) => {
        if (filename && (filename.endsWith(".ts") || filename.endsWith(".tsx"))) {
          console.log(`[runtime] Block changed: ${filename}`)
        }
      })
      state.fileWatchers.push(watcher)
      console.log("[runtime] Watching blocks/ for changes")
    } catch (err) {
      console.warn("[runtime] Could not watch blocks/:", err)
    }
  }
}

/**
 * Check if a SQL query is DDL (schema-changing)
 */
function isDDL(sql: string): boolean {
  const normalized = sql.trim().toUpperCase()
  return (
    normalized.startsWith("CREATE ") ||
    normalized.startsWith("ALTER ") ||
    normalized.startsWith("DROP ") ||
    normalized.startsWith("TRUNCATE ")
  )
}

/**
 * Create the Hono app for instant serving
 */
function createApp(config: RuntimeConfig) {
  const app = new Hono()

  // CORS
  app.use("/*", cors())

  // Health - simple ready/booting status
  // Single process architecture: ready when both DB and Vite are up
  app.get("/health", (c) => {
    const ready = state.dbReady && state.viteReady
    return c.json({
      ready,
      status: ready ? "ready" : "booting", // backward compat
    })
  })

  // Status
  app.get("/status", (c) => {
    return c.json({
      workbookId: config.workbookId,
      workbookDir: config.workbookDir,
      services: {
        db: { ready: state.dbReady },
        vite: { ready: state.viteReady, port: state.vitePort, error: state.viteError },
      },
      buildErrors: state.buildErrors,
    })
  })

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
        worker: {
          up: state.viteReady,
          port: state.vitePort ?? 0,
          error: state.viteReady ? undefined : "Vite is starting",
        },
      },
    })
  })

  // Manifest - reads from filesystem only
  // Clients poll this endpoint (every 1s) instead of using SSE
  app.get("/workbook/manifest", async (c) => {
    const manifest = await getManifest(config.workbookDir, config.workbookId)
    return c.json(manifest)
  })

  // ============================================
  // Block Source API - for visual block editor
  // Supports nested paths like "ui/email-events"
  // ============================================

  // Get block source code
  // Use :blockId{.+} to support nested paths: /workbook/blocks/ui/email-events/source
  app.get("/workbook/blocks/:blockId{.+}/source", async (c) => {
    const blockId = c.req.param("blockId")
    const blocksDir = join(config.workbookDir, "blocks")

    for (const ext of [".tsx", ".ts"]) {
      const filePath = join(blocksDir, blockId + ext)
      if (existsSync(filePath)) {
        const source = readFileSync(filePath, "utf-8")
        return c.json({
          success: true,
          blockId,
          filePath,
          source,
        })
      }
    }

    return c.json({ error: "Block not found" }, 404)
  })

  // Save block source code
  // Use :blockId{.+} to support nested paths: /workbook/blocks/ui/email-events/source
  app.put("/workbook/blocks/:blockId{.+}/source", async (c) => {
    const blockId = c.req.param("blockId")
    const blocksDir = join(config.workbookDir, "blocks")
    const { source } = await c.req.json<{ source: string }>()

    if (!source || typeof source !== "string") {
      return c.json({ error: "Missing source in request body" }, 400)
    }

    // Find existing file or use .tsx for new files
    let filePath: string | null = null
    for (const ext of [".tsx", ".ts"]) {
      const path = join(blocksDir, blockId + ext)
      if (existsSync(path)) {
        filePath = path
        break
      }
    }

    // Default to .tsx for new blocks
    if (!filePath) {
      filePath = join(blocksDir, blockId + ".tsx")
    }

    try {
      // Write the source
      const { writeFileSync, mkdirSync } = await import("fs")

      // Ensure parent directories exist (for nested blocks like ui/email-events)
      const parentDir = filePath.substring(0, filePath.lastIndexOf("/"))
      if (!existsSync(parentDir)) {
        mkdirSync(parentDir, { recursive: true })
      }

      writeFileSync(filePath, source, "utf-8")

      return c.json({
        success: true,
        blockId,
        filePath,
      })
    } catch (err) {
      return c.json({
        error: `Failed to write block: ${err instanceof Error ? err.message : String(err)}`,
      }, 500)
    }
  })

  // Create new block
  // Supports nested paths like "ui/email-events"
  app.post("/workbook/blocks", async (c) => {
    const { blockId, source } = await c.req.json<{ blockId: string; source?: string }>()

    if (!blockId || typeof blockId !== "string") {
      return c.json({ error: "Missing blockId" }, 400)
    }

    // Validate block ID - allow paths with slashes, each segment must be valid
    // e.g., "ui/email-events" or "charts/sales/monthly"
    const segments = blockId.split("/")
    for (const segment of segments) {
      if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(segment)) {
        return c.json({ error: "Invalid blockId - each path segment must start with letter, contain only alphanumeric, dashes, underscores" }, 400)
      }
    }

    const blocksDir = join(config.workbookDir, "blocks")
    const filePath = join(blocksDir, blockId + ".tsx")

    // Check if already exists
    if (existsSync(filePath)) {
      return c.json({ error: "Block already exists" }, 409)
    }

    // Generate default source if not provided (use last segment for function name)
    const blockName = segments[segments.length - 1]
    const defaultSource = source ?? generateDefaultBlockSource(blockName)

    try {
      const { writeFileSync, mkdirSync } = await import("fs")

      // Ensure parent directories exist (for nested blocks)
      const parentDir = filePath.substring(0, filePath.lastIndexOf("/"))
      if (!existsSync(parentDir)) {
        mkdirSync(parentDir, { recursive: true })
      }

      writeFileSync(filePath, defaultSource, "utf-8")

      return c.json({
        success: true,
        blockId,
        filePath,
      }, 201)
    } catch (err) {
      return c.json({
        error: `Failed to create block: ${err instanceof Error ? err.message : String(err)}`,
      }, 500)
    }
  })

  // Delete block
  // Use :blockId{.+} to support nested paths: /workbook/blocks/ui/email-events
  app.delete("/workbook/blocks/:blockId{.+}", async (c) => {
    const blockId = c.req.param("blockId")
    const blocksDir = join(config.workbookDir, "blocks")

    let deleted = false
    for (const ext of [".tsx", ".ts"]) {
      const filePath = join(blocksDir, blockId + ext)
      if (existsSync(filePath)) {
        const { unlinkSync } = await import("fs")
        unlinkSync(filePath)
        deleted = true
        break
      }
    }

    if (!deleted) {
      return c.json({ error: "Block not found" }, 404)
    }

    return c.json({ success: true, blockId })
  })

  // Move/rename block with automatic import updates
  app.post("/workbook/blocks/move", async (c) => {
    const { from, to } = await c.req.json<{ from: string; to: string }>()

    if (!from || !to) {
      return c.json({ error: "Missing 'from' or 'to' in request body" }, 400)
    }

    const blocksDir = join(config.workbookDir, "blocks")

    // Find source file
    let sourceExt: string | null = null
    for (const ext of [".tsx", ".ts"]) {
      if (existsSync(join(blocksDir, from + ext))) {
        sourceExt = ext
        break
      }
    }

    if (!sourceExt) {
      return c.json({ error: `Block not found: ${from}` }, 404)
    }

    const sourcePath = join(blocksDir, from + sourceExt)
    const targetPath = join(blocksDir, to + sourceExt)

    // Check target doesn't already exist
    if (existsSync(targetPath)) {
      return c.json({ error: `Target already exists: ${to}` }, 409)
    }

    try {
      // Use ts-morph to move file and update all imports
      const { Project } = await import("ts-morph")

      // Check for tsconfig, create minimal one if missing
      const tsconfigPath = join(config.workbookDir, "tsconfig.json")
      let project: InstanceType<typeof Project>

      if (existsSync(tsconfigPath)) {
        project = new Project({ tsConfigFilePath: tsconfigPath })
      } else {
        // Create project without tsconfig, manually add source files
        project = new Project({ useInMemoryFileSystem: false })
        // Add all ts/tsx files in blocks directory
        project.addSourceFilesAtPaths(join(blocksDir, "**/*.{ts,tsx}"))
      }

      const sourceFile = project.getSourceFile(sourcePath)
      if (!sourceFile) {
        return c.json({ error: "Could not parse source file" }, 500)
      }

      // Ensure target directory exists
      const { mkdirSync } = await import("fs")
      const targetDir = targetPath.substring(0, targetPath.lastIndexOf("/"))
      if (!existsSync(targetDir)) {
        mkdirSync(targetDir, { recursive: true })
      }

      // Move file - ts-morph updates all imports automatically
      sourceFile.move(targetPath)

      // Save all changes
      await project.save()

      return c.json({
        success: true,
        from,
        to,
        message: "Block moved and imports updated",
      })
    } catch (err) {
      return c.json({
        error: `Failed to move block: ${err instanceof Error ? err.message : String(err)}`,
      }, 500)
    }
  })

  // DB routes - require DB ready
  app.post("/db/query", async (c) => {
    if (!state.dbReady || !state.workbookDb) {
      return c.json({ error: "Database not ready", booting: true }, 503)
    }

    const { query } = await c.req.json<{ query: string }>()
    try {
      const result = await state.workbookDb.db.query(query)

      // Check if DDL - regenerate schema
      if (isDDL(query)) {
        await state.workbookDb.regenerateSchema()
      }

      return c.json({ rows: result.rows, rowCount: result.rows.length })
    } catch (err) {
      return c.json({ error: String(err) }, 500)
    }
  })

  app.get("/db/tables", async (c) => {
    if (!state.dbReady || !state.workbookDb) {
      return c.json({ error: "Database not ready", booting: true }, 503)
    }

    try {
      const result = await state.workbookDb.db.query(`
        SELECT table_name as name
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        ORDER BY table_name
      `)
      return c.json(result.rows)
    } catch (err) {
      return c.json({ error: String(err) }, 500)
    }
  })

  // Backward-compatible /postgres/* routes for desktop app
  app.post("/postgres/query", async (c) => {
    if (!state.dbReady || !state.workbookDb) {
      return c.json({ error: "Database not ready", booting: true }, 503)
    }

    const { query } = await c.req.json<{ query: string }>()
    try {
      const result = await state.workbookDb.db.query(query)

      if (isDDL(query)) {
        await state.workbookDb.regenerateSchema()
      }

      return c.json({ rows: result.rows, rowCount: result.rows.length })
    } catch (err) {
      return c.json({ error: String(err) }, 500)
    }
  })

  app.get("/postgres/tables", async (c) => {
    if (!state.dbReady || !state.workbookDb) {
      return c.json({ error: "Database not ready", booting: true }, 503)
    }

    try {
      const result = await state.workbookDb.db.query(`
        SELECT table_name as name
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        ORDER BY table_name
      `)
      return c.json(result.rows)
    } catch (err) {
      return c.json({ error: String(err) }, 500)
    }
  })

  app.get("/postgres/schema", async (c) => {
    if (!state.dbReady || !state.workbookDb) {
      return c.json({ error: "Database not ready", booting: true }, 503)
    }

    try {
      // Get columns for all tables
      const result = await state.workbookDb.db.query(`
        SELECT
          t.table_name,
          c.column_name,
          c.data_type,
          c.is_nullable,
          c.column_default
        FROM information_schema.tables t
        JOIN information_schema.columns c ON t.table_name = c.table_name
        WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
        ORDER BY t.table_name, c.ordinal_position
      `)

      // Group by table for desktop app
      const tables: Record<string, { table_name: string; columns: { name: string; type: string; nullable: boolean }[] }> = {}
      for (const row of result.rows as Array<{ table_name: string; column_name: string; data_type: string; is_nullable: string }>) {
        if (!tables[row.table_name]) {
          tables[row.table_name] = { table_name: row.table_name, columns: [] }
        }
        tables[row.table_name].columns.push({
          name: row.column_name,
          type: row.data_type,
          nullable: row.is_nullable === "YES",
        })
      }

      return c.json(Object.values(tables))
    } catch (err) {
      return c.json({ error: String(err) }, 500)
    }
  })

  // Save workbook (dump DB to .hands/db.tar.gz)
  app.post("/db/save", async (c) => {
    if (!state.dbReady || !state.workbookDb) {
      return c.json({ error: "Database not ready", booting: true }, 503)
    }

    try {
      await state.workbookDb.save()
      return c.json({ success: true })
    } catch (err) {
      return c.json({ error: String(err) }, 500)
    }
  })

  // Get block context (for Vite server to use)
  app.get("/ctx", async (c) => {
    if (!state.dbReady || !state.workbookDb) {
      return c.json({ error: "Database not ready", booting: true }, 503)
    }
    // Context is ready - Vite will call this to check
    return c.json({ ready: true })
  })

  // Stop endpoint for graceful shutdown (used by Tauri)
  app.post("/stop", async (c) => {
    console.log("[runtime] Stop requested via /stop endpoint")
    // Trigger shutdown after responding
    setTimeout(() => process.exit(0), 100)
    return c.json({ success: true })
  })

  // ============================================
  // Source Management Routes
  // ============================================
  registerSourceRoutes(app, {
    workbookDir: config.workbookDir,
    getDbContext: () => state.workbookDb?.ctx ?? null,
    isDbReady: () => state.dbReady,
  })

  // Serve client modules for RSC hydration
  // These are "use client" components that need to be loaded client-side
  // Path format: /client-modules/ui/counter-button.tsx -> blocks/ui/counter-button.tsx
  app.get("/client-modules/*", async (c) => {
    if (!state.viteReady || !state.vitePort) {
      return c.json({ error: "Vite not ready", booting: true }, 503)
    }

    // Extract the module path from the request
    const modulePath = c.req.path.replace("/client-modules", "")

    // Request this module from Vite using the fs prefix for absolute paths
    // Vite's dev server can serve files outside the root using /@fs/ prefix
    const blocksDir = join(config.workbookDir, "blocks")
    const absolutePath = join(blocksDir, modulePath)
    const viteUrl = `http://localhost:${state.vitePort}/@fs${absolutePath}`

    try {
      const response = await fetch(viteUrl, {
        headers: {
          // Vite needs these headers to know we want ESM
          "Accept": "application/javascript, */*",
        },
      })

      if (!response.ok) {
        console.error(`[runtime] Failed to fetch client module: ${viteUrl} -> ${response.status}`)
        return c.json({ error: `Module not found: ${modulePath}` }, 404)
      }

      // Get the module content as text so we can rewrite imports
      let content = await response.text()

      // Rewrite imports to be absolute URLs pointing to this runtime
      // This is necessary because the module will be loaded from a different origin (editor)
      const runtimeOrigin = `http://localhost:${config.port}`

      // Rewrite Vite's special paths to go through our proxy
      // /@vite/client, /@react-refresh, /node_modules/.vite/deps/*, etc.
      // Include query strings like ?v=xxx
      content = content.replace(/from\s+["'](\/[^"']+)["']/g, (match, path) => {
        return `from "${runtimeOrigin}/vite-proxy${path}"`
      })
      content = content.replace(/import\s+["'](\/[^"']+)["']/g, (match, path) => {
        return `import "${runtimeOrigin}/vite-proxy${path}"`
      })
      // Also handle import() calls
      content = content.replace(/import\(["'](\/[^"']+)["']\)/g, (match, path) => {
        return `import("${runtimeOrigin}/vite-proxy${path}")`
      })

      // Return transformed JavaScript module
      const headers = new Headers()
      // Set correct content type for ES module
      headers.set("Content-Type", "application/javascript; charset=utf-8")
      // Allow CORS for cross-origin module loading
      headers.set("Access-Control-Allow-Origin", "*")

      return new Response(content, {
        status: response.status,
        headers,
      })
    } catch (err) {
      console.error(`[runtime] Client module proxy failed:`, err)
      return c.json({ error: "Module proxy failed: " + String(err) }, 502)
    }
  })

  // Proxy Vite internal routes for client module dependencies
  // Handles: /@vite/client, /@react-refresh, /node_modules/.vite/deps/*, /@fs/*
  app.get("/vite-proxy/*", async (c) => {
    if (!state.viteReady || !state.vitePort) {
      return c.json({ error: "Vite not ready", booting: true }, 503)
    }

    // Extract the path after /vite-proxy
    const vitePath = c.req.path.replace("/vite-proxy", "")

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
    }

    // Check if this is a React dep request
    const depMatch = vitePath.match(/\/node_modules\/\.vite\/deps\/(react[^?]*)/)
    if (depMatch) {
      const depName = depMatch[1]
      const shim = reactShims[depName]
      if (shim) {
        console.debug(`[runtime] Serving React shim for: ${depName}`)
        const headers = new Headers()
        headers.set("Content-Type", "application/javascript; charset=utf-8")
        headers.set("Access-Control-Allow-Origin", "*")
        headers.set("Cache-Control", "no-cache")
        return new Response(shim.trim(), { status: 200, headers })
      }
    }

    const viteUrl = `http://localhost:${state.vitePort}${vitePath}`

    try {
      const response = await fetch(viteUrl, {
        headers: {
          "Accept": "application/javascript, */*",
        },
      })

      if (!response.ok) {
        console.error(`[runtime] Failed to fetch vite dep: ${viteUrl} -> ${response.status}`)
        return c.json({ error: `Vite dependency not found: ${vitePath}` }, 404)
      }

      // Get the content as text to potentially rewrite nested imports
      let content = await response.text()

      // CRITICAL: If this chunk contains React or ReactDOM internals, replace with shim
      // to avoid "multiple copies of React" errors.
      if (vitePath.includes("chunk-")) {
        const isReactChunk = content.includes("node_modules/react/cjs/react.development.js") ||
                             content.includes("node_modules/react/cjs/react.production")
        const isReactDOMChunk = content.includes("node_modules/react-dom/cjs/react-dom.development.js") ||
                                content.includes("node_modules/react-dom/cjs/react-dom.production")

        if (isReactChunk) {
          console.debug(`[runtime] Detected React chunk, replacing with shim: ${vitePath}`)
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
`
          const headers = new Headers()
          headers.set("Content-Type", "application/javascript; charset=utf-8")
          headers.set("Access-Control-Allow-Origin", "*")
          headers.set("Cache-Control", "no-cache")
          return new Response(shimContent.trim(), { status: 200, headers })
        }

        if (isReactDOMChunk) {
          console.debug(`[runtime] Detected ReactDOM chunk, replacing with shim: ${vitePath}`)
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
`
          const headers = new Headers()
          headers.set("Content-Type", "application/javascript; charset=utf-8")
          headers.set("Access-Control-Allow-Origin", "*")
          headers.set("Cache-Control", "no-cache")
          return new Response(shimContent.trim(), { status: 200, headers })
        }
      }

      // Rewrite any nested imports in Vite deps to go through our proxy
      const runtimeOrigin = `http://localhost:${config.port}`
      content = content.replace(/from\s+["'](\/[^"']+)["']/g, (match, path) => {
        return `from "${runtimeOrigin}/vite-proxy${path}"`
      })
      content = content.replace(/import\s+["'](\/[^"']+)["']/g, (match, path) => {
        return `import "${runtimeOrigin}/vite-proxy${path}"`
      })
      content = content.replace(/import\(["'](\/[^"']+)["']\)/g, (match, path) => {
        return `import("${runtimeOrigin}/vite-proxy${path}")`
      })

      const headers = new Headers()
      headers.set("Content-Type", "application/javascript; charset=utf-8")
      headers.set("Access-Control-Allow-Origin", "*")

      return new Response(content, {
        status: response.status,
        headers,
      })
    } catch (err) {
      console.error(`[runtime] Vite proxy failed:`, err)
      return c.json({ error: "Vite proxy failed: " + String(err) }, 502)
    }
  })

  // Proxy to Vite for RSC routes
  app.all("/blocks/*", async (c) => {
    if (!state.viteReady || !state.vitePort) {
      return c.json({ error: "Vite not ready", booting: true }, 503)
    }

    const url = new URL(c.req.url)
    url.host = `localhost:${state.vitePort}`

    try {
      const response = await fetch(url.toString(), {
        method: c.req.method,
        headers: c.req.raw.headers,
        body: c.req.method !== "GET" ? await c.req.text() : undefined,
      })

      // Copy headers but remove transfer-encoding to avoid conflicts
      // The Node.js server will handle chunked encoding itself
      const headers = new Headers(response.headers)
      headers.delete("transfer-encoding")

      return new Response(response.body, {
        status: response.status,
        headers,
      })
    } catch (err) {
      return c.json({ error: "Vite proxy failed: " + String(err) }, 502)
    }
  })

  // Proxy RSC component routes to Vite worker
  // This allows the editor to render arbitrary components via Flight
  app.all("/rsc/*", async (c) => {
    if (!state.viteReady || !state.vitePort) {
      return c.json({ error: "Vite not ready", booting: true }, 503)
    }

    const url = new URL(c.req.url)
    url.host = `localhost:${state.vitePort}`

    try {
      const response = await fetch(url.toString(), {
        method: c.req.method,
        headers: c.req.raw.headers,
        body: c.req.method !== "GET" ? await c.req.text() : undefined,
      })

      const headers = new Headers(response.headers)
      headers.delete("transfer-encoding")

      return new Response(response.body, {
        status: response.status,
        headers,
      })
    } catch (err) {
      return c.json({ error: "Vite proxy failed: " + String(err) }, 502)
    }
  })

  // Proxy editor sandbox routes to editor Vite dev server
  // Desktop loads editor via /sandbox/sandbox.html
  app.all("/sandbox/*", async (c) => {
    if (!state.editorReady || !state.editorPort) {
      return c.json({ error: "Editor not ready", booting: true }, 503)
    }

    // Rewrite /sandbox/foo to /foo on the editor server
    const url = new URL(c.req.url)
    url.host = `localhost:${state.editorPort}`
    url.pathname = url.pathname.replace(/^\/sandbox/, "")

    try {
      const response = await fetch(url.toString(), {
        method: c.req.method,
        headers: c.req.raw.headers,
        body: c.req.method !== "GET" ? await c.req.text() : undefined,
      })

      const headers = new Headers(response.headers)
      headers.delete("transfer-encoding")

      return new Response(response.body, {
        status: response.status,
        headers,
      })
    } catch (err) {
      return c.json({ error: "Editor proxy failed: " + String(err) }, 502)
    }
  })

  return app
}

/**
 * Boot PGlite in background
 * Loads from .hands/db.tar.gz if exists, generates schema.ts
 */
async function bootPGlite(workbookDir: string) {
  console.log(`[runtime] Booting database for ${workbookDir}...`)

  try {
    state.workbookDb = await initWorkbookDb(workbookDir)
    state.dbReady = true
    console.log("[runtime] Database ready")
  } catch (err) {
    console.error("[runtime] Database failed:", err)
  }
}

/**
 * Create block context for execution
 */
function createBlockContext(params: Record<string, any> = {}): BlockContext {
  if (!state.workbookDb) {
    throw new Error("Database not ready")
  }
  return {
    db: state.workbookDb.ctx,
    sql: state.workbookDb.ctx.sql,
    params,
  }
}

/**
 * Build and start Vite in background
 */
async function bootVite(config: RuntimeConfig) {
  const { workbookDir, workbookId } = config
  const vitePort = PORTS.WORKER // Use worker port for Vite (55200)

  console.log("[runtime] Building RSC project...")

  try {
    const buildResult = await buildRSC(workbookDir, { verbose: true })

    // Log errors but continue - fail open in dev mode
    if (!buildResult.success) {
      console.warn("[runtime] Build has errors (will start Vite anyway):")
      for (const err of buildResult.errors) {
        console.warn(`  - ${err}`)
      }
      // Store errors for status endpoint
      state.buildErrors = buildResult.errors
    }

    const handsDir = buildResult.outputDir
    console.log(`[runtime] Built to ${handsDir}`)

    // Install deps if needed
    const nodeModules = join(handsDir, "node_modules")
    if (!existsSync(nodeModules)) {
      console.log("[runtime] Installing dependencies...")
      await new Promise<void>((resolve, reject) => {
        const proc = spawn("npm", ["install", "--legacy-peer-deps"], {
          cwd: handsDir,
          stdio: "inherit",
        })
        proc.on("close", (code) => {
          if (code === 0) resolve()
          else reject(new Error(`npm install failed with code ${code}`))
        })
      })
    }

    // Start Vite
    console.log(`[runtime] Starting Vite on port ${vitePort}...`)
    state.viteProc = spawn("npx", ["vite", "dev", "--port", String(vitePort), "--host", "127.0.0.1"], {
      cwd: handsDir,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        WORKBOOK_ID: workbookId,
        WORKBOOK_DIR: workbookDir,
        RUNTIME_PORT: String(config.port),
      },
    })

    // Forward Vite output but ignore EPIPE errors on shutdown
    // Capture stderr for error reporting
    let stderrBuffer = ""
    state.viteProc.stdout?.on("data", (data) => {
      process.stdout.write(data, () => {})
    })
    state.viteProc.stderr?.on("data", (data) => {
      const str = data.toString()
      stderrBuffer += str
      // Keep only last 2000 chars
      if (stderrBuffer.length > 2000) {
        stderrBuffer = stderrBuffer.slice(-2000)
      }
      process.stderr.write(data, () => {})
    })

    // Monitor for crashes - reset viteReady if process exits
    state.viteProc.on("exit", (code, signal) => {
      if (state.viteReady) {
        console.error(`[runtime] Vite crashed (code=${code}, signal=${signal})`)
        state.viteReady = false
        state.viteError = stderrBuffer || `Vite exited with code ${code}`
        state.viteProc = null
      }
    })

    // Wait for Vite to be ready
    const timeout = 30000
    const startTime = Date.now()

    while (Date.now() - startTime < timeout) {
      try {
        const response = await fetch(`http://localhost:${vitePort}/health`, {
          signal: AbortSignal.timeout(1000),
        })
        if (response.ok) {
          state.vitePort = vitePort
          state.viteReady = true
          state.viteError = null // Clear any previous error
          console.log(`[runtime] Vite ready on port ${vitePort}`)
          return
        }
      } catch {
        // Not ready yet
      }
      await new Promise((resolve) => setTimeout(resolve, 500))
    }

    console.error("[runtime] Vite failed to start within timeout")
  } catch (err) {
    console.error("[runtime] Vite boot failed:", err)
  }
}

/**
 * Boot the editor sandbox Vite dev server
 * This serves the visual editor UI that runs inside the iframe
 */
async function bootEditor(config: RuntimeConfig) {
  const editorPort = PORTS.EDITOR
  const editorPath = getEditorSourcePath()

  if (!existsSync(editorPath)) {
    console.warn(`[runtime] Editor package not found at ${editorPath}, skipping editor server`)
    return
  }

  console.log(`[runtime] Starting editor sandbox on port ${editorPort}...`)

  try {
    // Start Vite for the editor sandbox using bun to run the package script
    // This ensures we use the package's local vite version
    state.editorProc = spawn("bun", [
      "run", "vite",
      "--config", "vite.sandbox.config.ts",
      "--port", String(editorPort),
      "--host", "127.0.0.1",
    ], {
      cwd: editorPath,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        // Pass runtime port so editor knows where to fetch RSC/API
        RUNTIME_PORT: String(config.port),
      },
    })

    // Forward output
    state.editorProc.stdout?.on("data", (data) => {
      process.stdout.write(`[editor] ${data}`)
    })
    state.editorProc.stderr?.on("data", (data) => {
      process.stderr.write(`[editor] ${data}`)
    })

    state.editorProc.on("exit", (code, signal) => {
      if (state.editorReady) {
        console.error(`[runtime] Editor crashed (code=${code}, signal=${signal})`)
        state.editorReady = false
        state.editorProc = null
      }
    })

    // Wait for editor to be ready
    const timeout = 30000
    const startTime = Date.now()

    while (Date.now() - startTime < timeout) {
      try {
        const response = await fetch(`http://localhost:${editorPort}/sandbox.html`, {
          signal: AbortSignal.timeout(1000),
        })
        if (response.ok) {
          state.editorPort = editorPort
          state.editorReady = true
          console.log(`[runtime] Editor ready on port ${editorPort}`)
          return
        }
      } catch {
        // Not ready yet
      }
      await new Promise((resolve) => setTimeout(resolve, 500))
    }

    console.error("[runtime] Editor failed to start within timeout")
  } catch (err) {
    console.error("[runtime] Editor boot failed:", err)
  }
}

/**
 * Run the check command - diagnostics without starting server
 *
 * Usage: hands-runtime check <workbook-dir> [--json]
 */
async function runCheck() {
  const args = process.argv.slice(2)
  // Remove 'check' command
  const restArgs = args.slice(1)

  // Parse workbook dir (first positional arg or current directory)
  let workbookDir = process.cwd()
  let jsonOutput = false

  for (const arg of restArgs) {
    if (arg === "--json") {
      jsonOutput = true
    } else if (!arg.startsWith("-")) {
      workbookDir = arg
    }
  }

  // Resolve relative paths
  if (!workbookDir.startsWith("/")) {
    workbookDir = join(process.cwd(), workbookDir)
  }

  // Check workbook exists
  if (!existsSync(workbookDir)) {
    const result = {
      success: false,
      error: `Workbook directory not found: ${workbookDir}`,
    }
    if (jsonOutput) {
      console.log(JSON.stringify(result, null, 2))
    } else {
      console.error(`Error: ${result.error}`)
    }
    process.exit(1)
  }

  // Check for hands.json
  const handsJsonPath = join(workbookDir, "hands.json")
  if (!existsSync(handsJsonPath)) {
    const result = {
      success: false,
      error: `No hands.json found in ${workbookDir}`,
    }
    if (jsonOutput) {
      console.log(JSON.stringify(result, null, 2))
    } else {
      console.error(`Error: ${result.error}`)
    }
    process.exit(1)
  }

  // Count blocks
  const blocksDir = join(workbookDir, "blocks")
  let blockCount = 0
  if (existsSync(blocksDir)) {
    walkDirectory(blocksDir, blocksDir, (filePath) => {
      const filename = filePath.split("/").pop() || ""
      if ((filename.endsWith(".tsx") || filename.endsWith(".ts")) && !filename.startsWith("_")) {
        blockCount++
      }
    })
  }

  // Build result
  const result = {
    success: true,
    workbookDir,
    timestamp: Date.now(),
    summary: {
      blocks: blockCount,
    },
  }

  // Output
  if (jsonOutput) {
    console.log(JSON.stringify(result, null, 2))
  } else {
    console.log("✓ Workbook structure valid")
    console.log(`  ${blockCount} blocks available`)
  }

  process.exit(0)
}

/**
 * Main entry point
 */
async function main() {
  // Check for 'check' subcommand early
  const firstArg = process.argv[2]
  if (firstArg === "check") {
    await runCheck()
    return
  }

  const config = parseArgs()
  const { workbookId, workbookDir, port } = config

  console.log(`[runtime] Starting workbook: ${workbookId}`)

  // Ensure stdlib symlink exists at ~/.hands/stdlib
  ensureStdlibSymlink()

  // Repair workbook's node_modules/@hands/stdlib symlink if broken
  ensureWorkbookStdlibSymlink(workbookDir)

  // Preflight: Check for hands.json before starting anything
  const handsJsonPath = join(workbookDir, "hands.json")
  if (!existsSync(handsJsonPath)) {
    console.error(`\n[runtime] ERROR: No hands.json found in ${workbookDir}`)
    console.error(`[runtime] A hands.json file is required to run blocks.`)
    console.error(`[runtime] Create one with minimal config:`)
    console.error(`\n  {`)
    console.error(`    "name": "${workbookId}",`)
    console.error(`    "blocks": { "dir": "./blocks" }`)
    console.error(`  }\n`)
    process.exit(1)
  }

  // 1. IMMEDIATELY start HTTP server using Node's http module with Hono
  const app = createApp(config)
  const server = createServer(async (req, res) => {
    try {
      // Convert Node request to fetch Request
      const url = `http://localhost:${port}${req.url}`
      const headers = new Headers()
      for (const [key, value] of Object.entries(req.headers)) {
        if (value) headers.set(key, Array.isArray(value) ? value.join(", ") : value)
      }

      const body = req.method !== "GET" && req.method !== "HEAD"
        ? await new Promise<Buffer>((resolve) => {
            const chunks: Buffer[] = []
            req.on("data", (chunk) => chunks.push(chunk))
            req.on("end", () => resolve(Buffer.concat(chunks)))
          })
        : undefined

      const request = new Request(url, {
        method: req.method,
        headers,
        body,
      })

      // Get response from Hono
      const response = await app.fetch(request)

      // Send response
      res.statusCode = response.status
      response.headers.forEach((value, key) => {
        res.setHeader(key, value)
      })

      const responseBody = await response.arrayBuffer()
      res.end(Buffer.from(responseBody))
    } catch (err) {
      console.error("Request error:", err)
      res.statusCode = 500
      res.end("Internal Server Error")
    }
  })

  server.listen(port, () => {
    console.log(`[runtime] Server ready on http://localhost:${port}`)
    console.log(`[runtime] Manifest available at http://localhost:${port}/workbook/manifest`)

    // Output ready JSON for Tauri - format must match lib.rs expectations
    console.log(JSON.stringify({
      type: "ready",
      runtimePort: port,
      postgresPort: port, // PGlite is in-process, use same port
      workerPort: PORTS.WORKER,
    }))
  })

  // 2. Boot PGlite in background (non-blocking)
  bootPGlite(workbookDir)

  // 3. Build and start Vite in background (non-blocking)
  // Editor boot is chained after RSC Vite to avoid race conditions
  bootVite(config).then(() => {
    // 4. Boot editor sandbox Vite after RSC Vite is ready
    bootEditor(config)
  })

  // 5. Start file watcher for real-time manifest updates
  startFileWatcher(config)

  // Handle shutdown
  const shutdown = async () => {
    console.log("[runtime] Shutting down...")
    // Close file watchers
    for (const watcher of state.fileWatchers) {
      watcher.close()
    }
    if (state.viteProc) state.viteProc.kill()
    if (state.editorProc) state.editorProc.kill()
    if (state.workbookDb) {
      await state.workbookDb.save()
      await state.workbookDb.close()
    }
    server.close()
    process.exit(0)
  }

  process.on("SIGTERM", shutdown)
  process.on("SIGINT", shutdown)
}

main().catch((error) => {
  console.error("Fatal error:", error)
  process.exit(1)
})
