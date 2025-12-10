/**
 * Sync Engine - Bidirectional sync between visual editor and source files
 *
 * Handles:
 * - Debounced saves from visual editor to disk
 * - External file change detection
 * - Conflict resolution
 */

import { writeFile, readFile } from "fs/promises"
import { existsSync } from "fs"
import { BlockParser, getParser } from "../ast/parser"
import { BlockGenerator, getGenerator } from "../ast/generator"
import type { BlockModel } from "../model/block-model"
import { BlockFileWatcher, type FileChangeEvent } from "./file-watcher"
import { createHash } from "crypto"

export interface SyncEngineOptions {
  /** Debounce time for saves (ms) */
  saveDebounceMs?: number

  /** Callback when a file changes externally */
  onExternalChange?: (blockId: string, model: BlockModel) => void

  /** Callback when there's a conflict */
  onConflict?: (conflict: ConflictInfo) => void

  /** Callback for errors */
  onError?: (error: SyncError) => void
}

export interface ConflictInfo {
  type: "external_change" | "parse_error" | "write_error"
  blockId: string
  filePath: string
  visualModel?: BlockModel
  diskSource?: string
  error?: string
}

export interface SyncError {
  type: "parse" | "write" | "read"
  blockId: string
  filePath: string
  message: string
}

/**
 * Sync engine for bidirectional block editing
 */
export class SyncEngine {
  private parser: BlockParser
  private generator: BlockGenerator
  private fileWatcher: BlockFileWatcher | null = null

  private pendingChanges = new Map<string, BlockModel>()
  private saveTimeouts = new Map<string, ReturnType<typeof setTimeout>>()
  private lastKnownHashes = new Map<string, string>()

  private options: Required<SyncEngineOptions>

  constructor(
    private blocksDir: string,
    options: SyncEngineOptions = {}
  ) {
    this.parser = getParser()
    this.generator = getGenerator()

    this.options = {
      saveDebounceMs: options.saveDebounceMs ?? 500,
      onExternalChange: options.onExternalChange ?? (() => {}),
      onConflict: options.onConflict ?? (() => {}),
      onError: options.onError ?? (() => {}),
    }
  }

  /**
   * Start the sync engine
   */
  start(): void {
    this.fileWatcher = new BlockFileWatcher(this.blocksDir)
    this.fileWatcher.subscribe((event) => this.handleFileChange(event))
    this.fileWatcher.start()
  }

  /**
   * Stop the sync engine
   */
  async stop(): Promise<void> {
    // Clear pending saves
    for (const timeout of this.saveTimeouts.values()) {
      clearTimeout(timeout)
    }
    this.saveTimeouts.clear()

    // Stop file watcher
    if (this.fileWatcher) {
      await this.fileWatcher.stop()
      this.fileWatcher = null
    }
  }

  /**
   * Load a block from disk
   */
  async loadBlock(blockId: string): Promise<BlockModel | null> {
    const filePath = this.getFilePath(blockId)

    if (!existsSync(filePath)) {
      return null
    }

    try {
      const source = await readFile(filePath, "utf-8")
      const model = await this.parser.parseBlock(filePath, source)

      // Store hash for change detection
      this.lastKnownHashes.set(blockId, model.sourceHash)

      return model
    } catch (error) {
      this.options.onError({
        type: "read",
        blockId,
        filePath,
        message: error instanceof Error ? error.message : String(error),
      })
      return null
    }
  }

  /**
   * Save changes from visual editor (debounced)
   */
  saveChanges(model: BlockModel): void {
    const blockId = model.id

    // Store pending change
    this.pendingChanges.set(blockId, model)

    // Clear existing timeout
    const existingTimeout = this.saveTimeouts.get(blockId)
    if (existingTimeout) {
      clearTimeout(existingTimeout)
    }

    // Set new debounced save
    const timeout = setTimeout(() => {
      this.flushSave(blockId)
    }, this.options.saveDebounceMs)

    this.saveTimeouts.set(blockId, timeout)
  }

  /**
   * Immediately save pending changes for a block
   */
  async flushSave(blockId: string): Promise<boolean> {
    const model = this.pendingChanges.get(blockId)
    if (!model) return true

    // Clear from pending
    this.pendingChanges.delete(blockId)
    this.saveTimeouts.delete(blockId)

    const filePath = this.getFilePath(blockId)

    try {
      // Read current source for smart patching
      let originalSource: string | undefined
      if (existsSync(filePath)) {
        originalSource = await readFile(filePath, "utf-8")

        // Check for conflict
        const diskHash = this.hashSource(originalSource)
        const lastKnownHash = this.lastKnownHashes.get(blockId)

        if (lastKnownHash && diskHash !== lastKnownHash) {
          // File changed externally since we last loaded it
          this.options.onConflict({
            type: "external_change",
            blockId,
            filePath,
            visualModel: model,
            diskSource: originalSource,
          })
          return false
        }
      }

      // Generate new source
      const newSource = await this.generator.generateSource(model, originalSource)

      // Ignore our own write in the file watcher
      this.fileWatcher?.ignoreNextChange(filePath)

      // Write to disk
      await writeFile(filePath, newSource, "utf-8")

      // Update known hash
      this.lastKnownHashes.set(blockId, this.hashSource(newSource))

      return true
    } catch (error) {
      this.options.onError({
        type: "write",
        blockId,
        filePath,
        message: error instanceof Error ? error.message : String(error),
      })

      this.options.onConflict({
        type: "write_error",
        blockId,
        filePath,
        visualModel: model,
        error: error instanceof Error ? error.message : String(error),
      })

      return false
    }
  }

  /**
   * Handle external file changes
   */
  private async handleFileChange(event: FileChangeEvent): Promise<void> {
    const { type, blockId, filePath, source } = event

    if (type === "unlink") {
      // File deleted - clear state
      this.lastKnownHashes.delete(blockId)
      this.pendingChanges.delete(blockId)
      return
    }

    if (!source) return

    // Check if we have pending changes for this block
    const pending = this.pendingChanges.get(blockId)
    if (pending) {
      // Conflict - external change while we have unsaved edits
      this.options.onConflict({
        type: "external_change",
        blockId,
        filePath,
        visualModel: pending,
        diskSource: source,
      })
      return
    }

    // Parse the new source
    try {
      const model = await this.parser.parseBlock(filePath, source)
      this.lastKnownHashes.set(blockId, model.sourceHash)
      this.options.onExternalChange(blockId, model)
    } catch (error) {
      this.options.onConflict({
        type: "parse_error",
        blockId,
        filePath,
        diskSource: source,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  /**
   * Resolve a conflict by choosing a strategy
   */
  async resolveConflict(
    blockId: string,
    strategy: "keep_visual" | "keep_disk" | "merge"
  ): Promise<BlockModel | null> {
    const pending = this.pendingChanges.get(blockId)
    const filePath = this.getFilePath(blockId)

    switch (strategy) {
      case "keep_visual":
        // Force save visual model
        if (pending) {
          this.lastKnownHashes.delete(blockId) // Clear hash to allow overwrite
          await this.flushSave(blockId)
          return pending
        }
        return null

      case "keep_disk":
        // Discard pending changes and reload
        this.pendingChanges.delete(blockId)
        return this.loadBlock(blockId)

      case "merge":
        // TODO: Implement three-way merge
        // For now, fall back to keep_disk
        console.warn("[SyncEngine] Merge not yet implemented, keeping disk version")
        this.pendingChanges.delete(blockId)
        return this.loadBlock(blockId)
    }
  }

  /**
   * Create a new block file
   */
  async createBlock(
    blockId: string,
    initialModel?: Partial<BlockModel>
  ): Promise<BlockModel> {
    const filePath = this.getFilePath(blockId)

    const model: BlockModel = {
      id: blockId,
      filePath,
      meta: initialModel?.meta ?? { title: blockId },
      signature: initialModel?.signature ?? {
        propsType: { properties: {}, required: [] },
        isAsync: true,
        functionName: toPascalCase(blockId),
      },
      root: initialModel?.root ?? {
        id: `node_${Date.now().toString(36)}`,
        type: "fragment",
        children: [],
      },
      queries: initialModel?.queries ?? [],
      imports: initialModel?.imports ?? [],
      sourceHash: "",
      lastModified: Date.now(),
    }

    // Generate and save
    const source = await this.generator.generateSource(model)
    model.sourceHash = this.hashSource(source)

    this.fileWatcher?.ignoreNextChange(filePath)
    await writeFile(filePath, source, "utf-8")
    this.lastKnownHashes.set(blockId, model.sourceHash)

    return model
  }

  /**
   * Delete a block file
   */
  async deleteBlock(blockId: string): Promise<void> {
    const filePath = this.getFilePath(blockId)

    // Clear state
    this.pendingChanges.delete(blockId)
    this.lastKnownHashes.delete(blockId)

    // Delete file
    const { unlink } = await import("fs/promises")
    await unlink(filePath)
  }

  /**
   * Get file path for a block
   */
  private getFilePath(blockId: string): string {
    return `${this.blocksDir}/${blockId}.tsx`
  }

  /**
   * Hash source code
   */
  private hashSource(source: string): string {
    return createHash("md5").update(source).digest("hex")
  }
}

/**
 * Convert string to PascalCase
 */
function toPascalCase(str: string): string {
  return str
    .split(/[-_\s]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join("")
}

/**
 * Create a sync engine
 */
export function createSyncEngine(
  blocksDir: string,
  options?: SyncEngineOptions
): SyncEngine {
  return new SyncEngine(blocksDir, options)
}
