/**
 * Page System
 *
 * Discovers and serves MDX pages with block support.
 * Auto-formats .md to .mdx and ensures proper frontmatter.
 */

export { discoverPages, type PageDiscoveryResult } from "./discovery.js"
export { compilePage, type CompiledPage } from "./mdx.js"
export { renderPage, type RenderPageOptions } from "./render.js"
export { PageRegistry } from "./registry.js"
export { formatPages, formatPage, type FormatResult } from "./formatter.js"
