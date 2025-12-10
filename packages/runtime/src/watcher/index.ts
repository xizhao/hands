/**
 * File Watcher with Race Condition Protection
 *
 * Features:
 * - Debounced change detection
 * - Ignores changes during active eval (prevents infinite loops from formatters)
 * - Waits for worker ready before triggering eval
 * - Uses event bus for loose coupling
 */

import { watch, type FSWatcher } from "fs"
import { getEventBus } from "../events"

export interface WatcherConfig {
  workbookDir: string
  /** Debounce delay in ms (default: 500) */
  debounceMs?: number
  /** Patterns to ignore */
  ignore?: string[]
  /** File extensions to watch */
  extensions?: string[]
}

export interface FileChange {
  path: string
  event: "add" | "change" | "unlink"
}

const DEFAULT_IGNORE = [
  "db/",
  "node_modules/",
  ".hands/",
  ".git/",
  ".",  // Hidden files
]

const DEFAULT_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".json", ".toml", ".md", ".mdx"]

export class FileWatcher {
  private watcher: FSWatcher | null = null
  private config: Required<WatcherConfig>
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private pendingChanges: Map<string, FileChange> = new Map()
  private isEvalRunning = false
  private isWorkerReady = false

  constructor(config: WatcherConfig) {
    this.config = {
      workbookDir: config.workbookDir,
      debounceMs: config.debounceMs ?? 500,
      ignore: config.ignore ?? DEFAULT_IGNORE,
      extensions: config.extensions ?? DEFAULT_EXTENSIONS,
    }

    // Subscribe to events
    const bus = getEventBus()

    // Track worker readiness
    bus.on("service:worker:ready", () => {
      this.isWorkerReady = true
    })
    bus.on("service:worker:stopped", () => {
      this.isWorkerReady = false
    })
    bus.on("service:worker:error", () => {
      this.isWorkerReady = false
    })

    // Track eval state to prevent infinite loops
    bus.on("eval:started", () => {
      this.isEvalRunning = true
    })
    bus.on("eval:completed", () => {
      this.isEvalRunning = false
    })
    bus.on("eval:error", () => {
      this.isEvalRunning = false
    })
  }

  /**
   * Start watching for file changes
   */
  start(): void {
    if (this.watcher) return

    this.watcher = watch(
      this.config.workbookDir,
      { recursive: true },
      (event, filename) => {
        if (!filename) return
        if (!this.shouldWatch(filename)) return

        // Determine change type
        const changeType = event === "rename" ? "unlink" : "change"
        this.handleChange({ path: filename, event: changeType })
      }
    )

    console.log(`[watcher] Watching ${this.config.workbookDir}`)
  }

  /**
   * Stop watching
   */
  stop(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }

    if (this.watcher) {
      this.watcher.close()
      this.watcher = null
    }

    this.pendingChanges.clear()
    console.log("[watcher] Stopped")
  }

  /**
   * Check if a file should be watched
   */
  private shouldWatch(filename: string): boolean {
    // Check ignore patterns
    for (const pattern of this.config.ignore) {
      if (filename.startsWith(pattern) || filename.includes(`/${pattern}`)) {
        return false
      }
    }

    // Check extensions
    const hasValidExtension = this.config.extensions.some((ext) =>
      filename.endsWith(ext)
    )

    return hasValidExtension
  }

  /**
   * Handle a file change with debouncing
   */
  private handleChange(change: FileChange): void {
    // Accumulate changes
    this.pendingChanges.set(change.path, change)

    // Reset debounce timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
    }

    this.debounceTimer = setTimeout(() => {
      this.flushChanges()
    }, this.config.debounceMs)
  }

  /**
   * Flush accumulated changes and trigger eval
   */
  private async flushChanges(): Promise<void> {
    const changes = Array.from(this.pendingChanges.values())
    this.pendingChanges.clear()
    this.debounceTimer = null

    if (changes.length === 0) return

    // Skip if eval is currently running (prevents infinite loops from formatters)
    if (this.isEvalRunning) {
      console.log("[watcher] Skipping eval - another eval is in progress")
      return
    }

    // Skip if worker isn't ready yet
    if (!this.isWorkerReady) {
      console.log("[watcher] Skipping eval - worker not ready")
      return
    }

    const bus = getEventBus()

    // Emit individual file events
    for (const change of changes) {
      bus.emit("file:changed", change)
    }

    // Emit debounced batch event
    bus.emit("file:debounced", { paths: changes.map((c) => c.path) })

    // The actual eval is triggered by the index.ts listening to file:debounced
  }
}

/**
 * Create and start a file watcher
 */
export function createWatcher(config: WatcherConfig): FileWatcher {
  const watcher = new FileWatcher(config)
  watcher.start()
  return watcher
}
