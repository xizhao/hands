/**
 * File Watcher - Watch block files for external changes
 *
 * Uses chokidar to efficiently watch the blocks directory
 * and notify when files are added, changed, or deleted.
 */

import { watch, type FSWatcher } from "chokidar"
import { readFile } from "fs/promises"
import { join, relative } from "path"

export type FileChangeType = "add" | "change" | "unlink"

export interface FileChangeEvent {
  type: FileChangeType
  filePath: string
  blockId: string
  source?: string
}

export type FileChangeHandler = (event: FileChangeEvent) => void

/**
 * Watch a blocks directory for changes
 */
export class BlockFileWatcher {
  private watcher: FSWatcher | null = null
  private blocksDir: string
  private handlers = new Set<FileChangeHandler>()
  private ignoreSet = new Set<string>()

  constructor(blocksDir: string) {
    this.blocksDir = blocksDir
  }

  /**
   * Start watching the blocks directory
   */
  start(): void {
    if (this.watcher) return

    const pattern = join(this.blocksDir, "**/*.{tsx,ts}")

    this.watcher = watch(pattern, {
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 100,
      },
      // Ignore node_modules and hidden files
      ignored: /(^|[\/\\])(\.|node_modules)/,
    })

    this.watcher.on("add", (path) => this.handleChange("add", path))
    this.watcher.on("change", (path) => this.handleChange("change", path))
    this.watcher.on("unlink", (path) => this.handleChange("unlink", path))

    this.watcher.on("error", (error) => {
      console.error("[BlockFileWatcher] Error:", error)
    })
  }

  /**
   * Stop watching
   */
  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close()
      this.watcher = null
    }
  }

  /**
   * Subscribe to file changes
   */
  subscribe(handler: FileChangeHandler): () => void {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }

  /**
   * Temporarily ignore changes to a file (for our own writes)
   */
  ignoreNextChange(filePath: string): void {
    this.ignoreSet.add(filePath)

    // Auto-clear after a short delay
    setTimeout(() => {
      this.ignoreSet.delete(filePath)
    }, 1000)
  }

  /**
   * Handle a file change event
   */
  private async handleChange(type: FileChangeType, filePath: string): Promise<void> {
    // Check if we should ignore this change
    if (this.ignoreSet.has(filePath)) {
      this.ignoreSet.delete(filePath)
      return
    }

    // Extract block ID from file path
    const relativePath = relative(this.blocksDir, filePath)
    const blockId = relativePath.replace(/\.(tsx?|jsx?)$/, "")

    // Read source for add/change events
    let source: string | undefined
    if (type !== "unlink") {
      try {
        source = await readFile(filePath, "utf-8")
      } catch (error) {
        console.error(`[BlockFileWatcher] Failed to read ${filePath}:`, error)
        return
      }
    }

    const event: FileChangeEvent = {
      type,
      filePath,
      blockId,
      source,
    }

    // Notify all handlers
    for (const handler of this.handlers) {
      try {
        handler(event)
      } catch (error) {
        console.error("[BlockFileWatcher] Handler error:", error)
      }
    }
  }

  /**
   * Get list of currently watched files
   */
  getWatched(): string[] {
    if (!this.watcher) return []

    const watched = this.watcher.getWatched()
    const files: string[] = []

    for (const [dir, names] of Object.entries(watched)) {
      for (const name of names) {
        if (name.endsWith(".tsx") || name.endsWith(".ts")) {
          files.push(join(dir, name))
        }
      }
    }

    return files
  }
}

/**
 * Create and start a file watcher
 */
export function createFileWatcher(blocksDir: string): BlockFileWatcher {
  const watcher = new BlockFileWatcher(blocksDir)
  watcher.start()
  return watcher
}
