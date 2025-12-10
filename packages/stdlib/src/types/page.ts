/**
 * Page Types
 *
 * Pages are markdown files with MDX support for embedding blocks.
 */

import type { BlockContext } from "./block.js"

/**
 * Page frontmatter (YAML at the top of markdown files)
 *
 * @example
 * ```markdown
 * ---
 * title: Dashboard
 * description: Main analytics dashboard
 * ---
 *
 * # Dashboard
 *
 * <Block src="metrics" />
 * ```
 */
export interface PageMeta {
  /** Page title (used in <title> and navigation) */
  title: string

  /** SEO description */
  description?: string

  /** Layout template to use (future) */
  layout?: string

  /** Custom CSS class to add to the page */
  className?: string

  /** Custom metadata fields */
  [key: string]: unknown
}

/**
 * Page context for rendering
 */
export interface PageContext {
  /** Resolved page metadata from frontmatter */
  meta: PageMeta

  /** URL params from dynamic route segments */
  params: Record<string, string>

  /** Block context for embedded blocks */
  blockContext: BlockContext
}

/**
 * Discovered page (used by runtime)
 */
export interface DiscoveredPage {
  /** Route path (e.g., "/", "/dashboard", "/docs/intro") */
  route: string

  /** File path relative to pages directory */
  path: string

  /** Page metadata from frontmatter */
  meta: PageMeta
}

/**
 * Page render result
 */
export interface PageRenderResult {
  /** Rendered HTML */
  html: string

  /** Page metadata */
  meta: PageMeta

  /** Any errors that occurred during rendering */
  error?: string
}

/**
 * MDX Block component props
 *
 * Used in MDX pages: `<Block src="my-block" prop1="value" />`
 */
export interface MdxBlockProps {
  /** Block source (must match a block in blocks/, e.g., "welcome" for blocks/welcome.tsx) */
  src: string

  /** Additional props passed to the block function */
  [key: string]: unknown
}
