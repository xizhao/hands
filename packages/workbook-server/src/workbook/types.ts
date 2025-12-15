/**
 * Workbook Types
 *
 * Shared types for workbook discovery and manifest generation.
 */

export interface WorkbookConfig {
  /** Root path to the workbook */
  rootPath: string;
  /** Path to blocks directory (default: rootPath/blocks) */
  blocksDir?: string;
  /** Path to pages directory (default: rootPath/pages) */
  pagesDir?: string;
  /** Path to ui directory (default: rootPath/ui) */
  uiDir?: string;
  /** Output directory for generated files (default: rootPath/.hands) */
  outDir?: string;
}

export interface ResolvedWorkbookConfig {
  rootPath: string;
  blocksDir: string;
  pagesDir: string;
  uiDir: string;
  outDir: string;
}

// ============================================================================
// Blocks
// ============================================================================

export interface BlockMeta {
  title?: string;
  description?: string;
  refreshable?: boolean;
}

export interface DiscoveredBlock {
  /** Block ID derived from path (e.g., "charts/bar-chart") */
  id: string;
  /** Relative path from blocks dir (e.g., "charts/bar-chart.tsx") */
  path: string;
  /** Parent directory (e.g., "charts" or "") */
  parentDir: string;
  /** Extracted metadata */
  meta: BlockMeta;
  /** Whether block has @hands:uninitialized marker */
  uninitialized?: boolean;
}

// ============================================================================
// Pages
// ============================================================================

export interface DiscoveredPage {
  /** Route path (e.g., "/", "/about", "/docs/intro") */
  route: string;
  /** Relative path from pages dir */
  path: string;
  /** File extension (.md, .mdx, .plate.json) */
  ext: string;
}

// ============================================================================
// UI Components
// ============================================================================

export interface DiscoveredComponent {
  /** Component name from filename (e.g., "chart", "button") */
  name: string;
  /** Relative path from ui dir */
  path: string;
  /** Whether component has "use client" directive */
  isClientComponent: boolean;
}

// ============================================================================
// Discovery Results
// ============================================================================

export interface DiscoveryError {
  file: string;
  error: string;
}

export interface DiscoveryResult<T> {
  items: T[];
  errors: DiscoveryError[];
}

export interface WorkbookManifest {
  /** Discovered blocks */
  blocks: DiscoveredBlock[];
  /** Discovered pages */
  pages: DiscoveredPage[];
  /** Discovered UI components */
  components: DiscoveredComponent[];
  /** Discovery errors */
  errors: DiscoveryError[];
  /** Timestamp of discovery */
  timestamp: number;
}
