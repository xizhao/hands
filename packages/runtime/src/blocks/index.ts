/**
 * Block System
 *
 * Discovers, validates, and serves blocks from the blocks/ directory.
 */

export { discoverBlocks, type BlockDiscoveryResult } from "./discovery.js"
export { validateBlockFile, type BlockValidationResult } from "./validate.js"
export { createBlockContext, type BlockContextOptions } from "./context.js"
export { serveBlock, type BlockServeOptions, type BlockServeResult } from "./serve.js"
export { BlockRegistry } from "./registry.js"
