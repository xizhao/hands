/**
 * Block Types
 *
 * Blocks are server-rendered React components that can query the database.
 */

import type { ReactElement } from "react"

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
  id: string
  path: string
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
