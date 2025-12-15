/**
 * Block Types
 *
 * Blocks are server-rendered React components that can query the database.
 *
 * Server components access the database via import:
 *   import { db } from '@hands/runtime/context'
 *   const users = await db.sql<User>`SELECT * FROM users`
 *
 * Client components ("use client") cannot access the database directly.
 */

import type { ReactElement } from "react";

/**
 * pgtyped prepared query interface
 * Compatible with queries created by sql`` tagged template from @pgtyped/runtime
 */
export interface PreparedQuery<TParams, TResult> {
  /** Execute the prepared query with params */
  run(params: TParams, client: unknown): Promise<TResult[]>;
}

/**
 * SQL query interface - tagged template literal for safe queries
 *
 * Used by both the runtime context and legacy ctx prop pattern.
 */
export interface DbContext {
  /**
   * Tagged template literal for type-safe SQL queries
   * @example
   * import { db } from '@hands/runtime/context'
   * const users = await db.sql<User>`SELECT * FROM users WHERE active = ${true}`
   */
  sql<T = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T[]>;

  /**
   * Execute a pgtyped prepared query with type-safe params and results
   * @example
   * import { db } from '@hands/runtime/context'
   * import { getActiveUsers } from './my-block.types'
   * const users = await db.query(getActiveUsers, { active: true })
   */
  query<TParams, TResult>(
    preparedQuery: PreparedQuery<TParams, TResult>,
    params: TParams,
  ): Promise<TResult[]>;
}

/**
 * Block function signature
 *
 * Blocks are React components that can be server or client components.
 *
 * Server components can query the database via import:
 * @example
 * ```tsx
 * import { db } from '@hands/runtime/context'
 *
 * export default async function MyBlock({ limit = 10 }) {
 *   const items = await db.sql<Item>\`SELECT * FROM items LIMIT \${limit}\`
 *   return <ul>{items.map(item => <li key={item.id}>{item.name}</li>)}</ul>
 * }
 * ```
 *
 * Client components use "use client" and receive only serializable props:
 * @example
 * ```tsx
 * "use client"
 *
 * export default function MyClientBlock({ data }) {
 *   const [count, setCount] = useState(0)
 *   return <button onClick={() => setCount(c => c + 1)}>{count}</button>
 * }
 * ```
 */
export type BlockFn<TProps = Record<string, unknown>> = (
  props: TProps,
) => ReactElement | Promise<ReactElement>;

// =============================================================================
// Legacy types (deprecated - use import { db } from '@hands/runtime/context')
// =============================================================================

/**
 * @deprecated Use `import { db } from '@hands/runtime/context'` instead of ctx prop
 */
export interface BlockContext<TParams = Record<string, unknown>> {
  db: DbContext;
  sql: DbContext["sql"];
  query: DbContext["query"];
  params: TParams;
}

/**
 * @deprecated Use `import { db } from '@hands/runtime/context'` instead of ctx prop
 */
export type BlockProps<TProps = unknown, TParams = Record<string, unknown>> = TProps & {
  ctx: BlockContext<TParams>;
};

/**
 * @deprecated Use BlockFn instead
 */
export type LegacyBlockFn<TProps = unknown, TParams = Record<string, unknown>> = (
  props: BlockProps<TProps, TParams>,
) => ReactElement | Promise<ReactElement>;

/**
 * Block metadata for discovery and UI
 */
export interface BlockMeta {
  title?: string;
  description?: string;
  refreshable?: boolean;
}

/**
 * Discovered block (used by runtime)
 */
export interface DiscoveredBlock {
  /** Block ID - path-based for nested blocks (e.g., "charts/bar-chart") */
  id: string;
  /** Relative path to the file from blocks dir (e.g., "charts/bar-chart.tsx") */
  path: string;
  /** Parent directory path (empty string for root, "charts" for charts/foo.tsx) */
  parentDir: string;
  meta: BlockMeta;
  load: () => Promise<{ default: BlockFn; meta?: BlockMeta }>;
}

/**
 * Result of rendering a block
 */
export interface BlockRenderResult {
  html: string;
  blockId: string;
  error?: string;
}
