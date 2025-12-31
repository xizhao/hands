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
// Domains (tables as first-class entities)
// ============================================================================

/** Foreign key relationship for a domain */
export interface DomainForeignKey {
  /** Column in this table */
  column: string;
  /** Referenced table */
  referencedTable: string;
  /** Referenced column */
  referencedColumn: string;
}

/** Column in a domain's table */
export interface DomainColumn {
  /** Column name */
  name: string;
  /** SQLite type */
  type: string;
  /** Whether column can be null */
  nullable: boolean;
  /** Whether this is the primary key */
  isPrimary: boolean;
  /** Default value if any */
  defaultValue?: string;
}

/** Schema sync status */
export interface DomainSyncStatus {
  /** Whether page schema matches current table schema */
  isSynced: boolean;
  /** Current table schema hash */
  currentHash: string;
  /** Schema hash stored in page frontmatter */
  pageHash?: string;
}

/** A discovered domain (table as first-class entity) */
export interface DiscoveredDomain {
  /** Table name (serves as unique identifier) */
  id: string;
  /** Display name derived from table name or page metadata */
  name: string;
  /** Column definitions */
  columns: DomainColumn[];
  /** Schema hash for change detection */
  schemaHash: string;
  /** Foreign key relationships */
  foreignKeys: DomainForeignKey[];
  /** Related domain IDs (tables that reference this one) */
  relatedDomains: string[];
  /** Whether this domain has an associated page */
  hasPage: boolean;
  /** Page path if exists */
  pagePath?: string;
  /** Page ID if exists */
  pageId?: string;
  /** Icon from page frontmatter */
  icon?: string;
  /** Sync status with associated page */
  syncStatus: DomainSyncStatus;
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
  /** Discovered blocks (reusable components) */
  blocks: DiscoveredBlock[];
  /** Discovered actions */
  actions: DiscoveredAction[];
  /** Discovery errors */
  errors: DiscoveryError[];
  /** Timestamp of discovery */
  timestamp: number;
}
