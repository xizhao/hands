/**
 * Block Context
 *
 * Creates the context object passed to block functions.
 */

import type { BlockContext, SqlClient } from "@hands/stdlib"
import postgres from "postgres"

export interface BlockContextOptions {
  /** Database connection string */
  databaseUrl: string

  /** Environment variables / secrets */
  env?: Record<string, string>

  /** URL params */
  params?: Record<string, string>

  /** Request info */
  request?: {
    headers: Record<string, string>
    url: string
  }
}

/**
 * Create a block context for rendering blocks
 *
 * @param options - Context options
 */
export function createBlockContext(options: BlockContextOptions): BlockContext {
  const sql = createSqlClient(options.databaseUrl)

  return {
    db: sql,
    env: options.env || {},
    params: options.params || {},
    request: options.request,
  }
}

/**
 * Create a SQL client from a connection string
 */
function createSqlClient(connectionString: string): SqlClient {
  // Create postgres client
  const client = postgres(connectionString, {
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
  })

  // Wrap as SqlClient interface
  const sqlClient = async function <T extends Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T[]> {
    // Use postgres tagged template literal
    const result = await client(strings, ...values)
    return result as T[]
  } as SqlClient

  // Add unsafe method
  sqlClient.unsafe = async function <T extends Record<string, unknown>>(
    query: string,
    params?: unknown[]
  ): Promise<T[]> {
    const result = await client.unsafe(query, params)
    return result as T[]
  }

  return sqlClient
}

/**
 * Create a mock block context for testing
 */
export function createMockBlockContext(
  overrides: Partial<BlockContext> = {}
): BlockContext {
  const mockSql = (async () => []) as SqlClient
  mockSql.unsafe = async () => []

  return {
    db: mockSql,
    env: {},
    params: {},
    ...overrides,
  }
}
