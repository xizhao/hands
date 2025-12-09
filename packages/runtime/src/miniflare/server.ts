/**
 * Miniflare-based Dev Server
 *
 * Uses Miniflare directly instead of wrangler for:
 * - Full control over the dev server
 * - Same workerd runtime as CF Workers (consistent with prod)
 * - Simpler architecture (no wrangler process spawning)
 * - Faster startup
 *
 * @see https://miniflare.dev/
 */

import { Miniflare } from "miniflare"
import { existsSync, readFileSync, writeFileSync } from "fs"
import { join, dirname } from "path"
import { spawn } from "bun"
import type { ServiceStatus, ServiceState, BuildError } from "../types"
import { build } from "../build"
import { getEventBus } from "../events"

export interface MiniflareServerConfig {
  workbookDir: string
  port: number
  databaseUrl?: string
}

// Find the monorepo root by looking for the root package.json with workspaces
function findMonorepoRoot(): string | null {
  let current = dirname(dirname(dirname(import.meta.dir)))

  for (let i = 0; i < 10; i++) {
    const pkgPath = join(current, "package.json")
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"))
        if (pkg.workspaces) {
          return current
        }
      } catch {}
    }
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }
  return null
}

export class MiniflareServer {
  private config: MiniflareServerConfig
  private mf: Miniflare | null = null
  private _state: ServiceState = "stopped"
  private _port: number
  private _lastError?: string
  private _startedAt?: number
  private _restartCount = 0
  private _buildErrors: BuildError[] = []

  constructor(config: MiniflareServerConfig) {
    this.config = config
    this._port = config.port
  }

  get status(): ServiceStatus {
    return {
      state: this._state,
      up: this._state === "running",
      port: this._port,
      error: this._state === "failed" ? this._lastError : undefined,
      lastError: this._lastError,
      startedAt: this._startedAt,
      restartCount: this._restartCount,
      buildErrors: this._buildErrors.length > 0 ? this._buildErrors : undefined,
    }
  }

  get buildErrors(): BuildError[] {
    return this._buildErrors
  }

  /**
   * Link @hands/stdlib directly in node_modules for dev mode
   * This avoids modifying package.json and keeps the project clean
   */
  private async linkStdlib(): Promise<void> {
    const monorepoRoot = findMonorepoRoot()
    if (!monorepoRoot) {
      return
    }

    const stdlibPath = join(monorepoRoot, "packages", "stdlib")
    if (!existsSync(stdlibPath)) {
      return
    }

    const nodeModules = join(this.config.workbookDir, "node_modules")
    const handsDir = join(nodeModules, "@hands")
    const targetLink = join(handsDir, "stdlib")

    // Create @hands directory if needed
    if (!existsSync(handsDir)) {
      const { mkdirSync } = await import("fs")
      mkdirSync(handsDir, { recursive: true })
    }

    // Create symlink if it doesn't exist or points to wrong place
    try {
      const { lstatSync, symlinkSync, unlinkSync, readlinkSync } = await import("fs")

      if (existsSync(targetLink)) {
        try {
          const currentTarget = readlinkSync(targetLink)
          if (currentTarget === stdlibPath) {
            return // Already linked correctly
          }
          // Wrong target, remove it
          unlinkSync(targetLink)
        } catch {
          // Not a symlink, remove it
          const { rmSync } = await import("fs")
          rmSync(targetLink, { recursive: true })
        }
      }

      symlinkSync(stdlibPath, targetLink, "dir")
      console.log(`[miniflare] Linked @hands/stdlib -> ${stdlibPath}`)
    } catch (err) {
      console.log("[miniflare] Failed to link stdlib:", err)
    }
  }

  /**
   * Check if dependencies are installed
   */
  private async ensureDependencies(): Promise<void> {
    const nodeModules = join(this.config.workbookDir, "node_modules")
    const hasHono = existsSync(join(nodeModules, "hono"))

    if (!hasHono) {
      console.log("[miniflare] Installing workbook dependencies...")

      const proc = spawn(["bun", "install", "--ignore-scripts"], {
        cwd: this.config.workbookDir,
        stdout: "inherit",
        stderr: "inherit",
      })

      const exitCode = await proc.exited
      if (exitCode !== 0) {
        throw new Error("Failed to install dependencies")
      }
    }

    // Always ensure stdlib is linked (handles dev mode linking)
    await this.linkStdlib()
  }

  /**
   * Start the Miniflare server
   */
  async start(): Promise<void> {
    if (this.mf && this._state === "running") {
      console.log("[miniflare] Server already running")
      return
    }

    const bus = getEventBus()
    this._state = "starting"
    this._buildErrors = []

    try {
      // Ensure dependencies are installed
      await this.ensureDependencies()

      // Build first
      const buildResult = await build(this.config.workbookDir, { dev: true })
      if (!buildResult.success) {
        throw new Error(`Build failed: ${buildResult.errors.join(", ")}`)
      }

      const entryPoint = join(buildResult.outputDir, "worker.js")
      if (!existsSync(entryPoint)) {
        throw new Error(`Worker entry point not found: ${entryPoint}`)
      }

      console.log(`[miniflare] Starting on port ${this._port}...`)

      // Read worker script directly (Miniflare's scriptPath has issues with path resolution)
      const workerScript = readFileSync(entryPoint, "utf-8")

      // Create Miniflare instance
      this.mf = new Miniflare({
        port: this._port,
        host: "127.0.0.1",
        modules: true,
        script: workerScript,

        // Bindings
        bindings: {
          DATABASE_URL: this.config.databaseUrl || "",
          ENVIRONMENT: "development",
        },

        // Compatibility - 2025-08-15+ enables MessageChannel/MessagePort globals
        // Required for React 19's react-dom/server.edge
        compatibilityDate: "2025-08-15",
        compatibilityFlags: ["nodejs_compat"],

        // Allow dynamic imports for blocks
        unsafeEvalBinding: "__UNSAFE_EVAL__",

        // Persistence (for KV, D1, R2 if needed later)
        kvPersist: join(this.config.workbookDir, ".hands", ".mf", "kv"),
        d1Persist: join(this.config.workbookDir, ".hands", ".mf", "d1"),
        r2Persist: join(this.config.workbookDir, ".hands", ".mf", "r2"),
      })

      // Wait for ready
      await this.mf.ready

      this._state = "running"
      this._startedAt = Date.now()
      this._buildErrors = []

      console.log(`[miniflare] Ready on http://localhost:${this._port}`)
      bus.emit("service:worker:ready", { port: this._port })
    } catch (error) {
      this._state = "failed"
      this._lastError = error instanceof Error ? error.message : String(error)
      this._buildErrors = this.parseError(error)

      console.error("[miniflare] Failed to start:", this._lastError)
      bus.emit("service:worker:error", {
        error: error instanceof Error ? error : new Error(String(error)),
      })

      throw error
    }
  }

  /**
   * Stop the Miniflare server
   */
  async stop(): Promise<void> {
    if (!this.mf) {
      this._state = "stopped"
      return
    }

    console.log("[miniflare] Stopping...")

    try {
      await this.mf.dispose()
    } catch (error) {
      console.error("[miniflare] Error stopping:", error)
    }

    this.mf = null
    this._state = "stopped"

    const bus = getEventBus()
    bus.emit("service:worker:stopped")

    console.log("[miniflare] Stopped")
  }

  /**
   * Restart the server
   */
  async restart(): Promise<void> {
    this._state = "restarting"
    this._restartCount++
    await this.stop()
    await this.start()
  }

  /**
   * Update bindings without full restart
   */
  async updateBindings(bindings: Record<string, string>): Promise<void> {
    if (!this.mf) {
      throw new Error("Server not running")
    }

    // Miniflare 3 supports setOptions for updating config
    await this.mf.setOptions({
      bindings: {
        DATABASE_URL: this.config.databaseUrl || "",
        ENVIRONMENT: "development",
        ...bindings,
      },
    })
  }

  /**
   * Dispatch a fetch request to the worker
   */
  async fetch(request: Request | string): Promise<Response> {
    if (!this.mf || this._state !== "running") {
      throw new Error("Server not running")
    }

    const req = typeof request === "string" ? new Request(request) : request
    return this.mf.dispatchFetch(req)
  }

  /**
   * Switch to a different workbook
   */
  async switchWorkbook(newWorkbookDir: string): Promise<void> {
    console.log(`[miniflare] Switching to workbook: ${newWorkbookDir}`)
    await this.stop()
    this.config.workbookDir = newWorkbookDir
    this._restartCount = 0
    this._buildErrors = []
    await this.start()
  }

  /**
   * Parse errors into structured format
   */
  private parseError(error: unknown): BuildError[] {
    const errorStr = error instanceof Error ? error.message : String(error)
    const errors: BuildError[] = []

    // Check for module resolution errors
    if (errorStr.includes("Could not resolve")) {
      const moduleMatch = errorStr.match(/Could not resolve ["']([^"']+)["']/)
      if (moduleMatch) {
        errors.push({
          type: "resolve",
          module: moduleMatch[1],
          message: `Could not resolve "${moduleMatch[1]}"`,
          suggestion: "Install the missing module",
        })
      }
    }

    // Check for syntax errors
    if (errorStr.includes("SyntaxError") || errorStr.includes("Parse error")) {
      const lineMatch = errorStr.match(/:(\d+):(\d+)/)
      errors.push({
        type: "syntax",
        line: lineMatch ? parseInt(lineMatch[1], 10) : undefined,
        column: lineMatch ? parseInt(lineMatch[2], 10) : undefined,
        message: errorStr.split("\n")[0],
      })
    }

    // Fallback
    if (errors.length === 0) {
      errors.push({
        type: "other",
        message: errorStr.slice(0, 500),
      })
    }

    return errors
  }
}

/**
 * Create a Miniflare server
 */
export function createMiniflareServer(config: MiniflareServerConfig): MiniflareServer {
  return new MiniflareServer(config)
}
