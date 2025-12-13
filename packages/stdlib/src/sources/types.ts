/**
 * Sources v2 - Table Containers with Optional Subscriptions
 *
 * A Source is a logical grouping of tables with:
 * - Auto-generated CRUD routes
 * - Optional Electric-SQL subscriptions for real-time sync
 * - Role-based permissions
 *
 * Tables are created in the database first, then introspected.
 * Schema is derived from DB, exported to schema.sql for portability.
 */

// =============================================================================
// Table Subscription (Electric-SQL Shape)
// =============================================================================

/**
 * Electric-SQL shape subscription for a table
 * Syncs data from a remote Postgres to the local PGlite table
 */
export interface TableSubscription {
  /** Electric service URL (e.g., "https://electric.example.com") */
  url: string;
  /** Remote table name to sync from */
  table: string;
  /** Optional WHERE clause to filter synced rows */
  where?: string;
  /** Optional column subset to sync (default: all columns) */
  columns?: string[];
}

// =============================================================================
// Table Definition
// =============================================================================

/**
 * Table definition within a source
 */
export interface TableDefinition {
  /** Optional description for documentation */
  description?: string;
  /**
   * Optional Electric-SQL subscription
   * If provided, the table will sync from the remote Postgres
   * If omitted, the table is local-only
   */
  subscription?: TableSubscription;
  /**
   * Optional role override for this table
   * Defaults to source-level permission
   */
  role?: "hands_reader" | "hands_writer" | "hands_admin";
}

// =============================================================================
// Source Permissions
// =============================================================================

export type SourceRole = "hands_reader" | "hands_writer" | "hands_admin";

export interface SourcePermissions {
  /** Default role for all tables in this source */
  default?: SourceRole;
  /** Per-table role overrides */
  tables?: Record<string, SourceRole>;
}

// =============================================================================
// Source Definition v2
// =============================================================================

export interface SourceDefinitionV2 {
  /** Unique source name (used in API routes) */
  name: string;
  /** Human-readable description */
  description?: string;
  /**
   * Tables in this source
   * Keys are table names, values are table definitions
   * Tables are discovered from DB, this config adds metadata
   */
  tables?: Record<string, TableDefinition>;
  /**
   * Role-based permissions
   * Controls CRUD access to tables
   */
  permissions?: SourcePermissions;
}

/**
 * Define a source (v2 - table containers)
 *
 * @example
 * ```typescript
 * export default defineSource({
 *   name: "crm",
 *   description: "Customer relationship management data",
 *   tables: {
 *     contacts: {
 *       subscription: {
 *         url: process.env.ELECTRIC_URL!,
 *         table: "contacts",
 *         where: "tenant_id = 'abc123'",
 *       },
 *     },
 *     deals: {
 *       // No subscription = local only
 *     },
 *   },
 *   permissions: {
 *     default: "hands_writer",
 *     tables: {
 *       contacts: "hands_reader", // read-only synced data
 *     },
 *   },
 * })
 * ```
 */
export function defineSourceV2(config: SourceDefinitionV2): SourceDefinitionV2 {
  return config;
}

// =============================================================================
// Discovered Source (Runtime)
// =============================================================================

/**
 * A source discovered by the runtime (v2 - table container)
 */
export interface DiscoveredSource {
  id: string;
  path: string;
  definition: SourceDefinitionV2;
  /** Tables discovered from DB that match this source */
  tables: DiscoveredTable[];
}

/**
 * A table discovered from the database
 */
export interface DiscoveredTable {
  name: string;
  source: string;
  schema: TableSchema;
  subscription?: TableSubscription & { status: SubscriptionStatus };
}

/**
 * Table schema from DB introspection
 */
export interface TableSchema {
  columns: TableColumn[];
  primaryKey?: string[];
  indexes?: TableIndex[];
}

export interface TableColumn {
  name: string;
  type: string;
  nullable: boolean;
  defaultValue?: string;
  isPrimaryKey: boolean;
}

export interface TableIndex {
  name: string;
  columns: string[];
  unique: boolean;
}

/**
 * Electric-SQL subscription status
 */
export interface SubscriptionStatus {
  active: boolean;
  shapeId?: string;
  lastSyncAt?: string;
  rowCount?: number;
  error?: string;
}
