/**
 * Domain Primitive Types
 *
 * A Domain represents a non-relation SQLite table as a first-class entity.
 * Each domain is implicitly linked to a page (sharing the table name),
 * where domain metadata is stored in the page's frontmatter.
 *
 * Domain = SQLite Table + Page + Schema Tracking
 */

// =============================================================================
// Domain Definition
// =============================================================================

/**
 * A Domain wraps a SQLite table with its associated page and metadata.
 * Domains are the primary organizational unit in a workbook.
 */
export interface Domain {
  /** Table name (serves as unique identifier) */
  id: string;

  /** Display name derived from table name or frontmatter */
  name: string;

  /** SQLite table schema */
  schema: DomainSchema;

  /** Associated page metadata (from frontmatter) */
  meta: DomainMeta;

  /** Whether this domain has an associated page file */
  hasPage: boolean;

  /** Page file path if it exists */
  pagePath?: string;

  /** Schema sync status */
  syncStatus: DomainSyncStatus;
}

/**
 * SQLite table schema for a domain.
 */
export interface DomainSchema {
  /** Table name */
  tableName: string;

  /** Column definitions */
  columns: DomainColumn[];

  /** Schema hash for change detection */
  hash: string;

  /** Foreign key relationships */
  foreignKeys: DomainForeignKey[];
}

/**
 * A column in a domain's table.
 */
export interface DomainColumn {
  /** Column name */
  name: string;

  /** SQLite type (TEXT, INTEGER, REAL, BLOB, NULL) */
  type: string;

  /** Whether the column can be null */
  nullable: boolean;

  /** Whether this is the primary key */
  isPrimary: boolean;

  /** Default value if any */
  defaultValue?: string;
}

/**
 * Foreign key relationship.
 */
export interface DomainForeignKey {
  /** Column in this table */
  column: string;

  /** Referenced table */
  referencedTable: string;

  /** Referenced column */
  referencedColumn: string;
}

// =============================================================================
// Domain Metadata (Page Frontmatter)
// =============================================================================

/**
 * Domain metadata stored in the associated page's frontmatter.
 */
export interface DomainMeta {
  /** Display icon (emoji) */
  icon?: string;

  /** Custom display name (overrides derived name) */
  title?: string;

  /** Description of this domain */
  description?: string;

  /** Table name (for linking page to domain) */
  domain?: string;

  /** Schema hash when page was last synced */
  schemaHash?: string;

  /** ISO timestamp of last schema sync */
  lastSyncedAt?: string;

  /** Custom color for UI */
  color?: string;

  /** Whether this domain is pinned/favorited */
  pinned?: boolean;

  /** Sort order */
  order?: number;
}

// =============================================================================
// Schema Sync Status
// =============================================================================

/**
 * Status of schema synchronization between table and page.
 */
export interface DomainSyncStatus {
  /** Whether page schema matches current table schema */
  isSynced: boolean;

  /** Current table schema hash */
  currentHash: string;

  /** Schema hash stored in page frontmatter */
  pageHash?: string;

  /** Detected schema changes if not synced */
  changes?: SchemaChange[];
}

/**
 * A detected change between page schema and current table schema.
 */
export interface SchemaChange {
  /** Type of change */
  type: "column_added" | "column_removed" | "column_modified" | "type_changed";

  /** Column name affected */
  column: string;

  /** Previous value (for modifications) */
  previous?: string;

  /** New value (for modifications) */
  current?: string;
}

// =============================================================================
// Domain Classification
// =============================================================================

/**
 * Determines if a table is a "relation" table (junction/bridge table).
 * Relation tables are excluded from domains.
 *
 * Heuristics:
 * - Table name contains common junction patterns (_to_, _x_, _rel_)
 * - Table has exactly 2 foreign keys and few other columns
 * - Table name is combination of two other table names
 */
export interface RelationTableDetection {
  /** Whether this appears to be a relation/junction table */
  isRelation: boolean;

  /** Reason for classification */
  reason?: string;

  /** Tables this junction connects (if applicable) */
  connectsTables?: [string, string];
}

// =============================================================================
// Utility Types
// =============================================================================

/**
 * Tab types for domain view.
 */
export type DomainTab = "page" | "sheet" | "relations" | "actions";

/**
 * Domain list item for sidebar display.
 */
export interface DomainListItem {
  /** Table name / domain ID */
  id: string;

  /** Display name */
  name: string;

  /** Icon emoji */
  icon?: string;

  /** Whether domain has an associated page */
  hasPage: boolean;

  /** Sync status indicator */
  syncStatus: "synced" | "outdated" | "no-page";

  /** Number of related domains */
  relationCount: number;
}
