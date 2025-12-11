/**
 * Source Sync Executor
 *
 * Simple executor: runs the sync function, returns result.
 * Source owns everything - fetching, transforming, writing to DB.
 */

import type { DbContext } from "@hands/stdlib"
import type { SourceContext } from "@hands/stdlib/sources"
import type { DiscoveredSource, SyncResult } from "./types.js"
import { loadSecrets } from "./secrets.js"

/**
 * Execute sync for a source
 *
 * @param source - Discovered source to sync
 * @param dbContext - Database context for source handler
 * @param workbookDir - Path to workbook directory (for secrets)
 * @returns Sync result with success/error and timing
 */
export async function executeSync(
  source: DiscoveredSource,
  dbContext: DbContext,
  workbookDir: string
): Promise<SyncResult> {
  const { id: sourceId, definition } = source
  const config = definition.config
  const startTime = Date.now()

  try {
    // Load secrets
    const secretsResult = loadSecrets(workbookDir, config.secrets)
    if (!secretsResult.success) {
      return {
        success: false,
        error: `Missing secrets: ${secretsResult.missing.join(", ")}`,
        durationMs: Date.now() - startTime,
      }
    }

    // Build context
    const ctx: SourceContext<typeof config.secrets> = {
      secrets: secretsResult.values as { [K in (typeof config.secrets)[number]]: string },
      db: dbContext,
      log: (...args: unknown[]) => console.log(`[${sourceId}]`, ...args),
    }

    // Run the sync function
    const result = await definition.sync(ctx)

    return {
      success: true,
      result,
      durationMs: Date.now() - startTime,
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    console.error(`[sources] Sync failed for ${sourceId}:`, err)

    return {
      success: false,
      error: errorMessage,
      durationMs: Date.now() - startTime,
    }
  }
}
