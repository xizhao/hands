/**
 * Workbook Types
 *
 * Shared types for workbook discovery and manifest generation.
 */

export interface WorkbookConfig {
  /** Root path to the workbook */
  rootPath: string;
  /** Path to pages directory (default: rootPath/pages) - blocks are in pages/blocks/ */
  pagesDir?: string;
  /** Path to plugins directory (default: rootPath/plugins) */
  pluginsDir?: string;
  /** Path to ui directory (default: rootPath/ui) */
  uiDir?: string;
  /** Path to actions directory (default: rootPath/actions) */
  actionsDir?: string;
  /** Output directory for generated files (default: rootPath/.hands) */
  outDir?: string;
}

export interface ResolvedWorkbookConfig {
  rootPath: string;
  pagesDir: string;
  pluginsDir: string;
  uiDir: string;
  actionsDir: string;
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

/** Subdirectory containing reusable blocks */
export const BLOCKS_SUBDIR = "blocks";

export interface DiscoveredPage {
  /** Route path (e.g., "/", "/about", "/docs/intro") */
  route: string;
  /** Relative path from pages dir */
  path: string;
  /** File extension (.md, .mdx, .plate.json) */
  ext: string;
  /** Parent directory (e.g., "blocks", "docs", or "") */
  parentDir: string;
  /** Whether this is a block (in blocks/ subdirectory) */
  isBlock: boolean;
}

// ============================================================================
// Plugins
// ============================================================================

export interface DiscoveredPlugin {
  /** Plugin ID derived from filename (e.g., "custom-chart") */
  id: string;
  /** Relative path from plugins dir */
  path: string;
  /** Display name extracted from metadata or filename */
  name: string;
  /** Description from JSDoc or metadata */
  description?: string;
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
// Database Tables
// ============================================================================

export interface DiscoveredTable {
  /** Table name */
  name: string;
  /** Column names */
  columns: string[];
}

// ============================================================================
// Actions
// ============================================================================

export interface DiscoveredAction {
  /** Action ID (derived from filename) */
  id: string;
  /** Path to the action file (relative to workbook root) */
  path: string;
  /** Whether action loaded successfully */
  valid: boolean;
  /** Error message if action failed to load */
  error?: string;
  /** Action name from definition */
  name?: string;
  /** Human-readable description */
  description?: string;
  /** Cron schedule expression */
  schedule?: string;
  /** Trigger types */
  triggers?: string[];
  /** Whether action has webhook trigger */
  hasWebhook?: boolean;
  /** Webhook path override */
  webhookPath?: string;
  /** Required secrets */
  secrets?: string[];
  /** Missing secrets (validation errors) */
  missingSecrets?: string[];
  /** Whether action has input schema */
  hasInput?: boolean;
  /** Whether action has database schema requirements */
  hasSchema?: boolean;
  /** Next scheduled run (ISO timestamp) */
  nextRun?: string;
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
  /** Discovered plugins */
  plugins: DiscoveredPlugin[];
  /** Discovered UI components */
  components: DiscoveredComponent[];
  /** Discovered database tables */
  tables: DiscoveredTable[];
  /** Discovered actions */
  actions: DiscoveredAction[];
  /** Discovery errors */
  errors: DiscoveryError[];
  /** Timestamp of discovery */
  timestamp: number;
}
