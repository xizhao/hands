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
import { existsSync, readdirSync, readFileSync } from "fs"
import { join } from "path"
import { createServer } from "http"
import { PGlite } from "@electric-sql/pglite"
import { Hono } from "hono"
import { cors } from "hono/cors"
import { buildRSC } from "./build/rsc.js"
import { PORTS } from "./ports.js"
import { createDbContext, type DbContext } from "./db/index.js"
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
  db: PGlite | null
  dbContext: DbContext | null
  viteProc: ChildProcess | null
}

// Global state for progressive readiness
const state: RuntimeState = {
  dbReady: false,
  viteReady: false,
  vitePort: null,
  db: null,
  dbContext: null,
  viteProc: null,
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
 * Create the Hono app for instant serving
 */
function createApp(config: RuntimeConfig) {
  const app = new Hono()

  // CORS
  app.use("/*", cors())

  // Health - instant, shows progressive readiness
  app.get("/health", (c) => {
    return c.json({
      status: state.dbReady && state.viteReady ? "ready" : "booting",
      db: state.dbReady,
      vite: state.viteReady,
      vitePort: state.vitePort,
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

  // Manifest - instant! Reads from filesystem only
  app.get("/workbook/manifest", (c) => {
    const manifest = getManifest(config.workbookDir, config.workbookId)
    return c.json(manifest)
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
    if (!state.dbReady || !state.db) {
      return c.json({ error: "Database not ready", booting: true }, 503)
    }

    const { query } = await c.req.json<{ query: string }>()
    try {
      const result = await state.db.query(query)
      return c.json({ rows: result.rows, rowCount: result.rows.length })
    } catch (err) {
      return c.json({ error: String(err) }, 500)
    }
  })

  app.get("/db/tables", async (c) => {
    if (!state.dbReady || !state.db) {
      return c.json({ error: "Database not ready", booting: true }, 503)
    }

    try {
      const result = await state.db.query(`
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

  // Get block context (for Vite server to use)
  app.get("/ctx", async (c) => {
    if (!state.dbReady || !state.dbContext) {
      return c.json({ error: "Database not ready", booting: true }, 503)
    }
    // Context is ready - Vite will call this to check
    return c.json({ ready: true })
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

      return new Response(response.body, {
        status: response.status,
        headers: response.headers,
      })
    } catch (err) {
      return c.json({ error: "Vite proxy failed: " + String(err) }, 502)
    }
  })

  return app
}

/**
 * Boot PGlite in background
 */
async function bootPGlite(workbookDir: string) {
  const dbPath = join(workbookDir, "db")
  console.log(`[runtime] Booting PGlite at ${dbPath}...`)

  try {
    // Use PGlite with Node.js filesystem
    state.db = new PGlite(dbPath)
    await state.db.waitReady
    state.dbContext = createDbContext(state.db)
    state.dbReady = true
    console.log("[runtime] PGlite ready")
  } catch (err) {
    console.error("[runtime] PGlite failed:", err)
  }
}

/**
 * Create block context for execution
 */
function createBlockContext(params: Record<string, any> = {}): BlockContext {
  if (!state.dbContext) {
    throw new Error("Database not ready")
  }
  return {
    db: state.dbContext,
    params,
  }
}

/**
 * Build and start Vite in background
 */
async function bootVite(config: RuntimeConfig) {
  const { workbookDir, workbookId } = config
  const vitePort = PORTS.RUNTIME + 100 // Use next port for Vite

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
      stdio: "inherit",
      env: {
        ...process.env,
        WORKBOOK_ID: workbookId,
        WORKBOOK_DIR: workbookDir,
        RUNTIME_PORT: String(config.port),
      },
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

    // Output ready JSON for CLI
    console.log(JSON.stringify({ type: "server_ready", port }))
  })

  // 2. Boot PGlite in background (non-blocking)
  bootPGlite(workbookDir)

  // 3. Build and start Vite in background (non-blocking)
  bootVite(config)

  // Handle shutdown
  const shutdown = async () => {
    console.log("[runtime] Shutting down...")
    if (state.viteProc) state.viteProc.kill()
    if (state.db) await state.db.close()
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
