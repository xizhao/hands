/**
 * Workbook Module
 *
 * Unified discovery, validation, and manifest generation for workbooks.
 */

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

// Discovery
export {
  discoverBlocks,
  discoverComponents,
  discoverPages,
  discoverWorkbook,
  resolveConfig,
} from "./discovery.js";

// Validation
export { extractBlockMeta, validateBlockFile } from "./validate.js";

// Manifest generation
export { generateManifests, watchWorkbook } from "./manifest.js";

// tRPC router for desktop communication
export { workbookTRPCRouter, type WorkbookTRPCContext, type WorkbookTRPCRouter } from "./trpc.js";
