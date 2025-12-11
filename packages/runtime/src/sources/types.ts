/**
 * Runtime types for source management
 */

import type { SourceDefinition } from "@hands/stdlib/sources"

/** A discovered source in the workbook */
export interface DiscoveredSource {
  id: string
  path: string
  definition: SourceDefinition<any, any>
}

/** Sync result returned by runtime */
export interface SyncResult {
  success: boolean
  result?: unknown
  error?: string
  durationMs: number
}
