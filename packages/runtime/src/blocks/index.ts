/**
 * Block System
 *
 * Discovers, validates, and serves blocks from the blocks/ directory.
 */

export { discoverBlocks, type BlockDiscoveryResult } from "./discovery.js"
export { validateBlockFile, type BlockValidationResult } from "./validate.js"
export { serveBlock, type BlockServeOptions, type BlockServeResult } from "./serve.js"
export { BlockRegistry } from "./registry.js"

// Re-export context types from stdlib
export type { BlockContext, DbContext, BlockFn, BlockMeta, DiscoveredBlock } from "@hands/stdlib"
