import type { DbContext } from "../types/block.js"

/**
 * Source - A data sync function
 *
 * Sources are serverless-style functions that sync external data.
 * The function owns everything: fetching, transforming, writing to DB.
 *
 * Return type determines runtime behavior:
 * - any object/void: Just returns the result (current default)
 *
 * Future return types (not yet implemented):
 * - AsyncGenerator<SchemaRecord[]>: dlt-style auto-table creation + upsert
 * - StreamResult: Real-time sync via Electric-style shapes
 * - PipelineResult: Multi-step ETL with checkpoints
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
