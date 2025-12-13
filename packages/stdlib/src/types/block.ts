/**
 * Block Types
 *
 * Blocks are server-rendered React components that can query the database.
 */

import type { ReactElement } from "react"

/**
 * pgtyped prepared query interface
 * Compatible with queries created by sql`` tagged template from @pgtyped/runtime
 */
export interface PreparedQuery<TParams, TResult> {
  /** Execute the prepared query with params */
  run(params: TParams, client: unknown): Promise<TResult[]>
}

/**
 * SQL query interface - tagged template literal for safe queries
 */
export interface DbContext {
  /**
   * Tagged template literal for type-safe SQL queries
   * @example
   * const users = await ctx.db.sql<User>`SELECT * FROM users WHERE active = ${true}`
   */
  sql<T = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T[]>

  /**
   * Execute a pgtyped prepared query with type-safe params and results
   * @example
   * import { getActiveUsers } from './my-block.types'
   * const users = await ctx.db.query(getActiveUsers, { active: true })
   */
  query<TParams, TResult>(
    preparedQuery: PreparedQuery<TParams, TResult>,
    params: TParams
  ): Promise<TResult[]>
}

/**
 * Context provided to every block function
 */
export interface BlockContext<TParams = Record<string, unknown>> {
  /** Database query interface */
  db: DbContext

  /**
   * Tagged template literal for type-safe SQL queries (shorthand for db.sql)
   * @example
   * const users = await ctx.sql<User>`SELECT * FROM users WHERE active = ${true}`
   */
  sql<T = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T[]>

  /**
   * Execute a pgtyped prepared query (shorthand for db.query)
   * @example
   * import { getActiveUsers } from './my-block.types'
   * const users = await ctx.query(getActiveUsers, { active: true })
   */
  query<TParams, TResult>(
    preparedQuery: PreparedQuery<TParams, TResult>,
    params: TParams
  ): Promise<TResult[]>

  /** URL params, form values, user inputs */
  params: TParams
}

/**
 * Props passed to block functions (includes context)
 */
export type BlockProps<TProps = unknown, TParams = Record<string, unknown>> = TProps & {
  ctx: BlockContext<TParams>
}

/**
 * Block function signature
 *
 * Blocks are async React server components that receive props with context.
 *
 * @example
 * ```tsx
 * const MyBlock: BlockFn<{ limit?: number }> = async ({ ctx, limit = 10 }) => {
 *   const items = await ctx.sql<Item>`SELECT * FROM items LIMIT ${limit}`
 *   return <ul>{items.map(item => <li key={item.id}>{item.name}</li>)}</ul>
 * }
 * export default MyBlock
 * ```
 */
export type BlockFn<TProps = unknown, TParams = Record<string, unknown>> = (
  props: BlockProps<TProps, TParams>
) => ReactElement | Promise<ReactElement>

/**
 * Block metadata for discovery and UI
 */
export interface BlockMeta {
  title?: string
  description?: string
  refreshable?: boolean
}

/**
 * Discovered block (used by runtime)
 */
export interface DiscoveredBlock {
  /** Block ID - path-based for nested blocks (e.g., "charts/bar-chart") */
  id: string
  /** Relative path to the file from blocks dir (e.g., "charts/bar-chart.tsx") */
  path: string
  /** Parent directory path (empty string for root, "charts" for charts/foo.tsx) */
  parentDir: string
  meta: BlockMeta
  load: () => Promise<{ default: BlockFn; meta?: BlockMeta }>
}

/**
 * Result of rendering a block
 */
export interface BlockRenderResult {
  html: string
  blockId: string
  error?: string
}
