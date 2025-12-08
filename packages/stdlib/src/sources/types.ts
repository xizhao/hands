import { z } from "zod"

/**
 * Source - A polling-based data connector for edge runtimes
 *
 * Sources are Cloudflare Workers-compatible functions that:
 * - Run on a cron schedule
 * - Fetch data from external APIs with pagination
 * - Persist cursor state for incremental syncs
 * - Write batches to postgres
 */

// Base context provided to all source handlers
export interface SourceContext<TSecrets extends z.ZodTypeAny = z.ZodObject<{}>> {
  /** Typed secrets based on source config */
  secrets: z.infer<TSecrets>
  /** Last sync cursor (null on first run) */
  cursor: string | null
  /** Persist cursor for next run */
  setCursor: (cursor: string) => void
  /** SQL client for writing to postgres */
  sql: SqlClient
  /** Structured logging */
  log: (...args: unknown[]) => void
}

// Minimal SQL client interface (edge-compatible)
export interface SqlClient {
  <T = unknown>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]>
  unsafe: <T = unknown>(query: string, params?: unknown[]) => Promise<T[]>
}

// Source configuration schema
export interface SourceConfig<TSecrets extends z.ZodObject<any> = z.ZodObject<{}>> {
  /** Unique identifier for this source */
  name: string
  /** Human-readable title */
  title: string
  /** Description of what this source syncs */
  description: string
  /** Cron schedule (default: hourly) */
  schedule?: string
  /** Required secrets/env vars */
  secrets: TSecrets
  /** Available data streams */
  streams: readonly string[]
  /** Primary key field(s) for deduplication */
  primaryKey?: string | string[]
}

// The source handler function type
export type SourceHandler<TSecrets extends z.ZodObject<any>, TRecord = unknown> = (
  ctx: SourceContext<TSecrets>
) => AsyncGenerator<TRecord[], void, unknown>

// Full source definition (config + handler)
export interface SourceDefinition<
  TSecrets extends z.ZodObject<any> = z.ZodObject<{}>,
  TRecord = unknown
> {
  config: SourceConfig<TSecrets>
  fetch: SourceHandler<TSecrets, TRecord>
}

// Registry item schema (for registry.json)
export const RegistryItemSchema = z.object({
  name: z.string(),
  type: z.literal("source"),
  title: z.string(),
  description: z.string(),
  files: z.array(
    z.object({
      path: z.string(),
      target: z.string(),
    })
  ),
  secrets: z.array(z.string()),
  streams: z.array(z.string()),
  tables: z.array(z.string()).optional(),
  schedule: z.string().optional(),
})

export type RegistryItem = z.infer<typeof RegistryItemSchema>

// Full registry schema
export const RegistrySchema = z.object({
  $schema: z.string().optional(),
  name: z.string(),
  version: z.string(),
  items: z.array(RegistryItemSchema),
})

export type Registry = z.infer<typeof RegistrySchema>

/**
 * Helper to define a source with full type inference
 */
export function defineSource<
  TSecrets extends z.ZodObject<any>,
  TRecord = unknown
>(
  config: SourceConfig<TSecrets>,
  fetch: SourceHandler<TSecrets, TRecord>
): SourceDefinition<TSecrets, TRecord> {
  return { config, fetch }
}
