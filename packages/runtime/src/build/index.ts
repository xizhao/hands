/**
 * Build System Types
 *
 * Shared types for the RSC and production build systems.
 */

export { buildProduction } from "./production.js";
// Re-export the build functions
export { buildRSC, buildRSC as build } from "./rsc.js";
// Re-export config generators for preflight scaffolding
export {
  generatePackageJson,
  generateViteConfig,
  generateWranglerConfig,
  generateClientEntry,
  generateTsConfig,
} from "./rsc.js";

/**
 * Hands workbook configuration (hands.json)
 */
export interface HandsConfig {
  name?: string;
  version?: string;

  /** Pages configuration */
  pages?: {
    dir?: string;
  };

  /** Blocks configuration */
  blocks?: {
    dir?: string;
    include?: string[];
    exclude?: string[];
  };

  /** Sources configuration */
  sources?: Record<string, SourceConfig>;

  /** Build configuration */
  build?: {
    outDir?: string;
  };
}

export interface SourceConfig {
  enabled?: boolean;
  schedule?: string;
  [key: string]: unknown;
}

/**
 * Build options
 */
export interface BuildOptions {
  verbose?: boolean;
  dev?: boolean;
}

/**
 * Build result
 */
export interface BuildResult {
  success: boolean;
  outputDir: string;
  files: string[];
  errors: string[];
  pages?: Array<{ route: string; path: string }>;
  blocks?: Array<{ id: string; path: string; parentDir: string }>;
}
