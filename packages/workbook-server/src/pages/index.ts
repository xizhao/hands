/**
 * Page System
 *
 * Discovers and serves MDX pages with block support.
 */

// Discovery
export { type DiscoveredPage, type DiscoverPagesResult, discoverPages } from "./discovery.js";

// MDX Parsing
export {
  type BlockReference,
  type CompiledPage,
  compilePage,
  getBlockSource,
  type PageMeta,
} from "./mdx.js";
// Registry
export {
  createPageRegistry,
  PageRegistry,
  type PageRegistryOptions,
  type RegisteredPage,
} from "./registry.js";
// Rendering
export {
  type PageRenderContext,
  type PageRenderResult,
  type RenderPageOptions,
  renderCompiledPage,
  renderPage,
} from "./render.js";
