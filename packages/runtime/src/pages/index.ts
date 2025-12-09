/**
 * Page System
 *
 * Discovers and serves markdown pages with MDX block support.
 */

export { discoverPages, type PageDiscoveryResult } from "./discovery.js"
export { compilePage, type CompiledPage } from "./mdx.js"
export { renderPage, type RenderPageOptions } from "./render.js"
export { PageRegistry } from "./registry.js"
