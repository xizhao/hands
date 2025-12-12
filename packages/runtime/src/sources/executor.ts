/**
 * Source Sync Executor
 *
 * Simple executor: runs the sync function, returns result.
 * Source owns everything - fetching, transforming, writing to DB.
 */

import type { DbContext } from "@hands/stdlib"
import type { SourceContext } from "@hands/stdlib/sources"
import type { DiscoveredSource, SyncResult, LogEntry } from "./types.js"
import { loadSecrets } from "./secrets.js"

/**
 * Execute sync for a source
 *
 * @param source - Discovered source to sync
 * @param dbContext - Database context for source handler
 * @param workbookDir - Path to workbook directory (for secrets)
 * @param onLog - Optional callback for streaming logs
 * @returns Sync result with success/error and timing
 */
export async function executeSync(
  source: DiscoveredSource,
  dbContext: DbContext,
  workbookDir: string,
  onLog?: (entry: LogEntry) => void
): Promise<SyncResult> {
  const { id: sourceId, definition } = source
  const config = definition.config
  const startTime = Date.now()
  const logs: LogEntry[] = []

  // Helper to add log entry
  const addLog = (level: LogEntry["level"], ...args: unknown[]) => {
    const message = args.map(arg =>
      typeof arg === "object" ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(" ")
    const entry: LogEntry = {
      timestamp: Date.now(),
      level,
      message,
    }
    logs.push(entry)
    onLog?.(entry)
    // Also log to console
    console.log(`[${sourceId}]`, message)
  }

  try {
    // Load secrets
    addLog("info", "Loading secrets...")
    const secretsResult = loadSecrets(workbookDir, config.secrets)
    if (!secretsResult.success) {
      addLog("error", `Missing secrets: ${secretsResult.missing.join(", ")}`)
      return {
        success: false,
        error: `Missing secrets: ${secretsResult.missing.join(", ")}`,
        durationMs: Date.now() - startTime,
        logs,
      }
    }
    addLog("info", `Loaded ${Object.keys(secretsResult.values).length} secrets`)

    // Build context with logging
    const ctx: SourceContext<typeof config.secrets> = {
      secrets: secretsResult.values as { [K in (typeof config.secrets)[number]]: string },
      db: dbContext,
      log: (...args: unknown[]) => addLog("info", ...args),
    }

    // Run the sync function
    addLog("info", "Starting sync...")
    const result = await definition.sync(ctx)
    addLog("info", "Sync completed successfully")

    return {
      success: true,
      result,
      durationMs: Date.now() - startTime,
      logs,
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    addLog("error", `Sync failed: ${errorMessage}`)
    console.error(`[sources] Sync failed for ${sourceId}:`, err)

    return {
      success: false,
      error: errorMessage,
      durationMs: Date.now() - startTime,
      logs,
    }
  }
}
