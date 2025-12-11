import type { DbContext } from "../types/block.js"

/**
 * Source - A data sync function
 *
 * Sources are serverless-style functions that sync external data.
 * The function owns everything: fetching, transforming, writing to DB.
 *
 * ## Return Types (determines runtime behavior)
 *
 * ### Current (implemented)
 * - `any object/void` - Just returns the result, source owns all DB writes
 *
 * ### Future Return Types (not yet implemented)
 *
 * **1. AsyncGenerator<SchemaRecord[]>** - dlt-style auto-table creation + upsert
 * ```typescript
 * async function* sync(ctx) {
 *   for await (const page of fetchPages()) {
 *     yield page.items.map(item => ({
 *       _stream: "items",  // -> creates/upserts to `items` table
 *       id: item.id,
 *       ...item
 *     }))
 *   }
 * }
 * ```
 * Runtime auto-creates tables from first batch schema, upserts by primaryKey.
 *
 * **2. ShapeResult** - Electric-style declarative shapes (inspired by ElectricSQL)
 * ```typescript
 * defineSource({
 *   name: "hackernews",
 *   shapes: {
 *     // Static shape - sync all, runtime manages incremental
 *     topStories: {
 *       table: "hn_stories",
 *       where: "type = 'top'",
 *       schedule: "*/15 * * * *",
 *     },
 *     // Parameterized shape - sync on-demand when subscribed
 *     storyComments: {
 *       table: "hn_comments",
 *       where: "story_id = $1",  // $1 provided by subscriber
 *     },
 *   },
 *   // Producer function populates the shapes
 *   sync: async (ctx) => { ... }
 * })
 * ```
 * Consumer-oriented: UI subscribes to shapes, runtime syncs what's needed.
 * Multiple shapes can be combined client-side for relations.
 *
 * **3. PipelineResult** - Multi-step ETL with checkpoints
 * ```typescript
 * definePipeline({
 *   steps: [
 *     { name: "extract", fn: extractFromAPI },
 *     { name: "transform", fn: normalizeData },
 *     { name: "load", fn: writeToDb },
 *   ],
 *   checkpoint: "step",  // Resume from last successful step
 * })
 * ```
 *
 * @see https://electric-sql.com/docs/guides/shapes for shape design inspiration
 */

export interface SourceContext<TSecrets extends readonly string[] = readonly string[]> {
  /** Secrets object - keys from config, values from env */
  secrets: { [K in TSecrets[number]]: string }
  /** Database query interface - source owns all writes */
  db: DbContext
  /** Structured logging */
  log: (...args: unknown[]) => void
}

export interface SourceConfig<TSecrets extends readonly string[] = readonly string[]> {
  name: string
  title: string
  description: string
  /** Cron schedule - used by orchestrator (desktop/cloudflare), not runtime */
  schedule?: string
  /** Required secret names (env var keys) */
  secrets: TSecrets
}

/** Source handler - just a function that gets context, returns anything */
export type SourceHandler<TSecrets extends readonly string[], TResult = unknown> = (
  ctx: SourceContext<TSecrets>
) => Promise<TResult>

export interface SourceDefinition<
  TSecrets extends readonly string[] = readonly string[],
  TResult = unknown,
> {
  config: SourceConfig<TSecrets>
  sync: SourceHandler<TSecrets, TResult>
}

/**
 * Define a source with full type inference
 *
 * @example
 * ```typescript
 * export default defineSource({
 *   name: "stripe",
 *   title: "Stripe",
 *   description: "Sync Stripe data",
 *   schedule: "0 *\/6 * * *",
 *   secrets: ["STRIPE_KEY"] as const,
 * }, async (ctx) => {
 *   const stripe = new Stripe(ctx.secrets.STRIPE_KEY)
 *   const customers = await stripe.customers.list()
 *
 *   for (const c of customers.data) {
 *     await ctx.db.sql`
 *       INSERT INTO customers (id, email, name)
 *       VALUES (${c.id}, ${c.email}, ${c.name})
 *       ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name
 *     `
 *   }
 *
 *   return { synced: customers.data.length }
 * })
 * ```
 */
export function defineSource<TSecrets extends readonly string[], TResult = unknown>(
  config: SourceConfig<TSecrets>,
  sync: SourceHandler<TSecrets, TResult>
): SourceDefinition<TSecrets, TResult> {
  return { config, sync }
}
