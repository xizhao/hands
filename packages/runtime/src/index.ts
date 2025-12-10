#!/usr/bin/env bun
/**
 * Hands Runtime - Instant streaming dev server
 *
 * Usage:
 *   hands-runtime --workbook-id=<id> --workbook-dir=<dir> [--port=<port>]
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
import { streamSSE } from "hono/streaming"
import { buildRSC } from "./build/rsc.js"
import { PORTS } from "./ports.js"
import { initWorkbookDb, type WorkbookDb } from "./db/index.js"
import { lintBlockRefs, type BlockLintResult } from "./blocks/lint.js"
import type { BlockContext } from "./ctx.js"

interface RuntimeConfig {
  workbookId: string
  workbookDir: string
  port: number
}

interface RuntimeState {
  dbReady: boolean
  viteReady: boolean
  vitePort: number | null
  workbookDb: WorkbookDb | null
  viteProc: ChildProcess | null
  // SSE clients for manifest watch
  manifestClients: Set<(manifest: ReturnType<typeof getManifest>) => void>
  fileWatchers: FSWatcher[]
  // Cached lint results
  lintResult: BlockLintResult | null
}

// Global state for progressive readiness
const state: RuntimeState = {
  dbReady: false,
  viteReady: false,
  vitePort: null,
  workbookDb: null,
  viteProc: null,
  lintResult: null,
  manifestClients: new Set(),
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

/**
 * Build manifest from filesystem (no DB needed - instant!)
 */
function getManifest(workbookDir: string, workbookId: string) {
  const pages: Array<{ id: string; title: string; path: string }> = []
  const blocks: Array<{ id: string; path: string }> = []

  // Read pages from filesystem
  const pagesDir = join(workbookDir, "pages")
  if (existsSync(pagesDir)) {
    for (const file of readdirSync(pagesDir)) {
      if (file.endsWith(".md") || file.endsWith(".mdx")) {
        const id = file.replace(/\.(mdx?|md)$/, "")
        const content = readFileSync(join(pagesDir, file), "utf-8")
        const title = extractTitle(content) || id
        pages.push({ id, title, path: file })
      }
    }
  }

  // Read blocks from filesystem
  const blocksDir = join(workbookDir, "blocks")
  if (existsSync(blocksDir)) {
    for (const file of readdirSync(blocksDir)) {
      if ((file.endsWith(".tsx") || file.endsWith(".ts")) && !file.startsWith("_")) {
        const id = file.replace(/\.tsx?$/, "")
        blocks.push({ id, path: file })
      }
    }
  }

  // Read config
  let config = {}
  const handsJsonPath = join(workbookDir, "hands.json")
  if (existsSync(handsJsonPath)) {
    try {
      config = JSON.parse(readFileSync(handsJsonPath, "utf-8"))
    } catch {}
  }

  return {
    workbookId,
    workbookDir,
    pages,
    blocks,
    config,
    isEmpty: pages.length === 0 && blocks.length === 0,
  }
}

function extractTitle(content: string): string | null {
  // Try frontmatter
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/)
  if (frontmatterMatch) {
    const titleMatch = frontmatterMatch[1].match(/title:\s*["']?([^"'\n]+)["']?/)
    if (titleMatch) return titleMatch[1]
  }
  // Try first heading
  const headingMatch = content.match(/^#\s+(.+)$/m)
  if (headingMatch) return headingMatch[1]
  return null
}

/**
 * Broadcast manifest update to all SSE clients
 */
function broadcastManifest(workbookDir: string, workbookId: string) {
  if (state.manifestClients.size === 0) return
  const manifest = getManifest(workbookDir, workbookId)
  for (const sendUpdate of state.manifestClients) {
    sendUpdate(manifest)
  }
}

/**
 * Start watching pages/ and blocks/ directories for changes
 * Uses fs.watch for real-time updates (not polling)
 */
function startFileWatcher(config: RuntimeConfig) {
  const { workbookDir, workbookId } = config
  const pagesDir = join(workbookDir, "pages")
  const blocksDir = join(workbookDir, "blocks")

  // Debounce to avoid duplicate events
  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  const debouncedBroadcast = () => {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      console.log("[runtime] File change detected, broadcasting manifest update")
      broadcastManifest(workbookDir, workbookId)
    }, 100) // 100ms debounce
  }

  // Invalidate lint cache and re-run lint
  const invalidateLint = () => {
    state.lintResult = lintBlockRefs(workbookDir)
    if (state.lintResult.errors.length > 0) {
      console.log(`[lint] Found ${state.lintResult.errors.length} block reference error(s)`)
      for (const err of state.lintResult.errors) {
        console.log(`  ${err.page}:${err.line} - Block src="${err.src}" not found`)
      }
    }
  }

  // Watch pages directory
  if (existsSync(pagesDir)) {
    try {
      const watcher = watch(pagesDir, { recursive: true }, (event, filename) => {
        if (filename && (filename.endsWith(".md") || filename.endsWith(".mdx"))) {
          invalidateLint()
          debouncedBroadcast()
        }
      })
      state.fileWatchers.push(watcher)
      console.log("[runtime] Watching pages/ for changes")
    } catch (err) {
      console.warn("[runtime] Could not watch pages/:", err)
    }
  }

  // Watch blocks directory
  if (existsSync(blocksDir)) {
    try {
      const watcher = watch(blocksDir, { recursive: true }, (event, filename) => {
        if (filename && (filename.endsWith(".ts") || filename.endsWith(".tsx"))) {
          invalidateLint()
          debouncedBroadcast()
        }
      })
      state.fileWatchers.push(watcher)
      console.log("[runtime] Watching blocks/ for changes")
    } catch (err) {
      console.warn("[runtime] Could not watch blocks/:", err)
    }
  }

  // Run initial lint
  invalidateLint()
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
        vite: { ready: state.viteReady, port: state.vitePort },
      },
    })
  })

  // Eval - returns diagnostic info for AlertsPanel
  // Simplified version (no tsc/biome) - just service status
  app.post("/eval", (c) => {
    // Run lint if not cached
    if (!state.lintResult) {
      state.lintResult = lintBlockRefs(config.workbookDir)
    }

    return c.json({
      timestamp: Date.now(),
      duration: 0,
      wrangler: null,
      typescript: { errors: [], warnings: [] },
      format: { fixed: [], errors: [] },
      unused: { exports: [], files: [] },
      blockRefs: state.lintResult,
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

  // Manifest - instant! Reads from filesystem only
  app.get("/workbook/manifest", (c) => {
    const manifest = getManifest(config.workbookDir, config.workbookId)
    return c.json(manifest)
  })

  // Manifest watch - SSE for real-time updates
  app.get("/workbook/manifest/watch", async (c) => {
    return streamSSE(c, async (stream) => {
      // Send initial manifest
      const initialManifest = getManifest(config.workbookDir, config.workbookId)
      await stream.writeSSE({ data: JSON.stringify(initialManifest) })

      // Register callback for updates
      const sendUpdate = (manifest: ReturnType<typeof getManifest>) => {
        stream.writeSSE({ data: JSON.stringify(manifest) }).catch(() => {
          // Client disconnected
          state.manifestClients.delete(sendUpdate)
        })
      }
      state.manifestClients.add(sendUpdate)

      // Keep connection alive
      const keepAlive = setInterval(() => {
        stream.writeSSE({ event: "ping", data: "" }).catch(() => {
          clearInterval(keepAlive)
          state.manifestClients.delete(sendUpdate)
        })
      }, 30000)

      // Cleanup on disconnect
      stream.onAbort(() => {
        clearInterval(keepAlive)
        state.manifestClients.delete(sendUpdate)
      })

      // Keep stream open indefinitely
      await new Promise(() => {})
    })
  })

  // Page content - instant! Reads from filesystem
  app.get("/workbook/pages/:pageId", async (c) => {
    const pageId = c.req.param("pageId")
    const pagesDir = join(config.workbookDir, "pages")

    for (const ext of [".mdx", ".md"]) {
      const path = join(pagesDir, pageId + ext)
      if (existsSync(path)) {
        const content = readFileSync(path, "utf-8")
        return c.json({ success: true, pageId, content })
      }
    }

    return c.json({ error: "Page not found" }, 404)
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

    if (!buildResult.success) {
      console.error("[runtime] Build failed:", buildResult.errors)
      return
    }

    const handsDir = buildResult.outputDir
    console.log(`[runtime] Built to ${handsDir}`)

    // Install deps if needed
    const nodeModules = join(handsDir, "node_modules")
    if (!existsSync(nodeModules)) {
      console.log("[runtime] Installing dependencies...")
      await new Promise<void>((resolve, reject) => {
        const proc = spawn("npm", ["install"], {
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
    state.viteProc.stdout?.on("data", (data) => {
      process.stdout.write(data, () => {})
    })
    state.viteProc.stderr?.on("data", (data) => {
      process.stderr.write(data, () => {})
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
 * Main entry point
 */
async function main() {
  const config = parseArgs()
  const { workbookId, workbookDir, port } = config

  console.log(`[runtime] Starting workbook: ${workbookId}`)

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
  bootVite(config)

  // 4. Start file watcher for real-time manifest updates
  startFileWatcher(config)

  // Handle shutdown
  const shutdown = async () => {
    console.log("[runtime] Shutting down...")
    // Close file watchers
    for (const watcher of state.fileWatchers) {
      watcher.close()
    }
    if (state.viteProc) state.viteProc.kill()
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
