/**
 * Workbook Module
 *
 * Unified discovery, validation, and manifest generation for workbooks.
 */

// Discovery
export {
  discoverBlocks,
  discoverComponents,
  discoverPages,
  discoverWorkbook,
  resolveConfig,
} from "./discovery.js";
// Manifest generation
export { generateManifests, watchWorkbook } from "./manifest.js";
// tRPC router for desktop communication
export { type WorkbookTRPCContext, type WorkbookTRPCRouter, workbookTRPCRouter } from "./trpc.js";
// Types
export type {
  BlockMeta,
  DiscoveredBlock,
  DiscoveredComponent,
  DiscoveredPage,
  DiscoveryError,
  DiscoveryResult,
  ResolvedWorkbookConfig,
  WorkbookConfig,
  WorkbookManifest,
} from "./types.js";
// Validation
export { extractBlockMeta, validateBlockFile } from "./validate.js";
