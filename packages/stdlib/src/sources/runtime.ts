import type { SourceContext, SourceDefinition, SqlClient } from "./types.js"

/**
 * Creates a Cloudflare Worker scheduled handler from a source definition
 *
 * This wraps the source's async generator in the Worker scheduled() API,
 * handling cursor persistence and batch inserts.
 */
export function createWorkerHandler<TSecrets extends import("zod").ZodObject<any>>(
  source: SourceDefinition<TSecrets>,
  options: {
    tableName: string
    batchSize?: number
  }
) {
  return {
    async scheduled(
      event: ScheduledEvent,
      env: Record<string, string> & { KV: KVNamespace; DB: D1Database },
      ctx: ExecutionContext
    ) {
      const cursorKey = `cursor:${source.config.name}`
      const cursor = await env.KV.get(cursorKey)

      // Extract secrets from env based on schema
      const secretKeys = Object.keys(source.config.secrets.shape)
      const secrets = Object.fromEntries(
        secretKeys.map((key) => [key, env[key]])
      ) as import("zod").infer<TSecrets>

      // Validate secrets
      const parsed = source.config.secrets.safeParse(secrets)
      if (!parsed.success) {
        console.error("Missing required secrets:", parsed.error.flatten())
        return
      }

      const sql = createD1Client(env.DB)

      const context: SourceContext<TSecrets> = {
        secrets: parsed.data,
        cursor,
        setCursor: (c: string) => {
          ctx.waitUntil(env.KV.put(cursorKey, c))
        },
        sql,
        log: console.log,
      }

      let totalRecords = 0
      const batchSize = options.batchSize ?? 100

      try {
        for await (const batch of source.fetch(context)) {
          if (batch.length === 0) continue

          // Insert batch into D1
          await insertBatch(env.DB, options.tableName, batch, batchSize)
          totalRecords += batch.length

          console.log(`[${source.config.name}] Inserted ${batch.length} records`)
        }

        console.log(`[${source.config.name}] Sync complete: ${totalRecords} total records`)
      } catch (error) {
        console.error(`[${source.config.name}] Sync failed:`, error)
        throw error
      }
    },
  }
}

/**
 * Creates a minimal SQL client wrapping D1
 */
function createD1Client(db: D1Database): SqlClient {
  const client = async <T = unknown>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T[]> => {
    // Build parameterized query
    let query = ""
    for (let i = 0; i < strings.length; i++) {
      query += strings[i]
      if (i < values.length) {
        query += `?${i + 1}`
      }
    }

    const result = await db.prepare(query).bind(...values).all()
    return result.results as T[]
  }

  client.unsafe = async <T = unknown>(
    query: string,
    params?: unknown[]
  ): Promise<T[]> => {
    const stmt = db.prepare(query)
    if (params?.length) {
      stmt.bind(...params)
    }
    const result = await stmt.all()
    return result.results as T[]
  }

  return client
}

/**
 * Batch insert records into D1
 */
async function insertBatch(
  db: D1Database,
  tableName: string,
  records: unknown[],
  batchSize: number
) {
  if (records.length === 0) return

  // Get columns from first record
  const firstRecord = records[0] as Record<string, unknown>
  const columns = Object.keys(firstRecord)
  const placeholders = columns.map((_, i) => `?${i + 1}`).join(", ")

  const insertSql = `INSERT OR REPLACE INTO ${tableName} (${columns.join(", ")}) VALUES (${placeholders})`

  // Process in batches
  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize)
    const statements = batch.map((record) => {
      const r = record as Record<string, unknown>
      return db.prepare(insertSql).bind(...columns.map((c) => r[c]))
    })

    await db.batch(statements)
  }
}

// Type definitions for Cloudflare Workers
declare global {
  interface ScheduledEvent {
    cron: string
    scheduledTime: number
  }

  interface ExecutionContext {
    waitUntil(promise: Promise<unknown>): void
    passThroughOnException(): void
  }

  interface KVNamespace {
    get(key: string): Promise<string | null>
    put(key: string, value: string): Promise<void>
    delete(key: string): Promise<void>
  }

  interface D1Database {
    prepare(query: string): D1PreparedStatement
    batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>
  }

  interface D1PreparedStatement {
    bind(...values: unknown[]): D1PreparedStatement
    all<T = unknown>(): Promise<D1Result<T>>
    run(): Promise<D1Result<unknown>>
    first<T = unknown>(): Promise<T | null>
  }

  interface D1Result<T> {
    results: T[]
    success: boolean
    meta: unknown
  }
}
