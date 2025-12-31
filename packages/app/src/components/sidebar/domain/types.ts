/**
 * Domain Sidebar Types
 *
 * A "domain" represents a table (non-relation) as the primary organizational unit.
 * Each domain can have a Page (generated MDX), Sheet (table browser), Relations, and Actions.
 *
 * These types mirror the server-side DiscoveredDomain from workbook-server.
 */

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

/** Foreign key relationship */
export interface DomainForeignKey {
  /** Column in this table */
  column: string;
  /** Referenced table */
  referencedTable: string;
  /** Referenced column */
  referencedColumn: string;
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

export interface Domain {
  /** Table name as the domain ID */
  id: string;
  /** Display name (derived from table name or page metadata) */
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

export type DomainTab = "page" | "sheet" | "actions";

export interface DomainViewState {
  /** Currently selected domain */
  domainId: string | null;
  /** Active tab within the domain */
  activeTab: DomainTab;
}
