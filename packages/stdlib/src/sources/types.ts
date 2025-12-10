import { z } from "zod"
import type { DbContext } from "../types/block.js"

/**
 * Source - A polling-based data connector
 *
 * Sources fetch data from external APIs and write to the database.
 */

export interface SourceContext<TSecrets extends z.ZodTypeAny = z.ZodObject<{}>> {
  /** Typed secrets based on source config */
  secrets: z.infer<TSecrets>
  /** Last sync cursor (null on first run) */
  cursor: string | null
  /** Persist cursor for next run */
  setCursor: (cursor: string) => void
  /** Database query interface */
  db: DbContext
  /** Structured logging */
  log: (...args: unknown[]) => void
}

export interface SourceConfig<TSecrets extends z.ZodObject<any> = z.ZodObject<{}>> {
  name: string
  title: string
  description: string
  schedule?: string
  secrets: TSecrets
  streams: readonly string[]
  primaryKey?: string | string[]
}

export type SourceHandler<TSecrets extends z.ZodObject<any>, TRecord = unknown> = (
  ctx: SourceContext<TSecrets>
) => AsyncGenerator<TRecord[], void, unknown>

export interface SourceDefinition<
  TSecrets extends z.ZodObject<any> = z.ZodObject<{}>,
  TRecord = unknown,
> {
  config: SourceConfig<TSecrets>
  fetch: SourceHandler<TSecrets, TRecord>
}

/**
 * Helper to define a source with full type inference
 */
export function defineSource<TSecrets extends z.ZodObject<any>, TRecord = unknown>(
  config: SourceConfig<TSecrets>,
  fetch: SourceHandler<TSecrets, TRecord>
): SourceDefinition<TSecrets, TRecord> {
  return { config, fetch }
}
