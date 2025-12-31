/**
 * Block Types
 *
 * Blocks are server-rendered React components that can query the database.
 *
 * Server components access the database via import:
 *   import { sql } from '@hands/db'
 *   const users = await sql<User>`SELECT * FROM users`
 *
 * Client components ("use client") cannot access the database directly.
 */

import type { ReactElement } from "react";

/**
 * Block function signature
 *
 * Blocks are React components that can be server or client components.
 *
 * Server components can query the database via import:
 * @example
 * ```tsx
 * import { sql } from '@hands/db'
 *
 * export default async function MyBlock({ limit = 10 }) {
 *   const items = await sql<Item>`SELECT * FROM items LIMIT ${limit}`
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
