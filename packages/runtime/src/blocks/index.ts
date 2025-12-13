/**
 * Block System
 *
 * Discovers, validates, and serves blocks from the blocks/ directory.
 */

// Re-export context types from stdlib
export type { BlockContext, BlockFn, BlockMeta, DbContext, DiscoveredBlock } from "@hands/stdlib";
export { type BlockDiscoveryResult, discoverBlocks } from "./discovery.js";
export { BlockRegistry } from "./registry.js";
export { type BlockServeOptions, type BlockServeResult, serveBlock } from "./serve.js";
export { type BlockValidationResult, validateBlockFile } from "./validate.js";
