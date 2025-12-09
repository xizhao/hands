/**
 * Block Types
 *
 * Blocks are server-rendered React components that can query the database
 * and render data. They are embedded in pages using MDX syntax.
 */

import type { ReactElement } from "react"

/**
 * SQL client for querying the database from blocks
 */
export interface SqlClient {
  /**
   * Tagged template literal for type-safe SQL queries
   * @example
   * const users = await ctx.db`SELECT * FROM users WHERE active = ${true}`;
   */
  <T extends Record<string, unknown> = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T[]>

  /**
   * Execute a raw SQL query (use with caution)
   * @example
   * const result = await ctx.db.unsafe('SELECT * FROM users WHERE id = $1', [userId]);
   */
  unsafe: <T extends Record<string, unknown> = Record<string, unknown>>(
    query: string,
    params?: unknown[]
  ) => Promise<T[]>
}

/**
 * Context provided to every block function
 */
export interface BlockContext {
  /** Typed postgres client for database queries */
  db: SqlClient

  /** Secrets from hands.json (environment variables) */
  env: Record<string, string>

  /** URL params if block is rendered with dynamic route params */
  params: Record<string, string>

  /** Optional request info (available in RSC context) */
  request?: {
    headers: Record<string, string>
    url: string
  }
}

/**
 * Block function signature - pure RSC
 *
 * Blocks are async functions that take props and context, and return React elements.
 * They run on the server and can query the database directly.
 *
 * @example
 * ```tsx
 * const MyBlock: BlockFn<{ limit?: number }> = async (props, ctx) => {
 *   const items = await ctx.db`SELECT * FROM items LIMIT ${props.limit ?? 10}`;
 *   return <ul>{items.map(item => <li key={item.id}>{item.name}</li>)}</ul>;
 * };
 * export default MyBlock;
 * ```
 */
export type BlockFn<TProps = unknown> = (
  props: TProps,
  ctx: BlockContext
) => ReactElement | Promise<ReactElement>

/**
 * Block metadata for discovery and UI
 */
export interface BlockMeta {
  /** Display title for the block */
  title?: string

  /** Description of what the block does */
  description?: string

  /** Can this block be refreshed by the user? */
  refreshable?: boolean

  /** Optional JSON schema for props validation */
  propsSchema?: Record<string, unknown>
}

/**
 * Discovered block with metadata (used by runtime)
 */
export interface DiscoveredBlock {
  /** Block ID (derived from filename) */
  id: string

  /** File path relative to blocks directory */
  path: string

  /** Block metadata (from exported `meta` constant) */
  meta: BlockMeta

  /** Lazy loader for the block module */
  load: () => Promise<{ default: BlockFn; meta?: BlockMeta }>
}

/**
 * Block render result
 */
export interface BlockRenderResult {
  /** Rendered HTML */
  html: string

  /** Block ID */
  blockId: string

  /** Any errors that occurred during rendering */
  error?: string
}
