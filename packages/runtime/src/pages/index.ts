/**
 * Page System
 *
 * Discovers and serves MDX pages with block support.
 */

// Discovery
export { discoverPages, type DiscoveredPage, type DiscoverPagesResult } from "./discovery.js";

// MDX Parsing
export {
  compilePage,
  getBlockSource,
  type BlockReference,
  type CompiledPage,
  type PageMeta,
} from "./mdx.js";

// Rendering
export {
  renderPage,
  renderCompiledPage,
  type PageRenderContext,
  type PageRenderResult,
  type RenderPageOptions,
} from "./render.js";

// Registry
export {
  PageRegistry,
  createPageRegistry,
  type PageRegistryOptions,
  type RegisteredPage,
} from "./registry.js";
