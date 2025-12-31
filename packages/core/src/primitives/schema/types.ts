/**
 * Action Schema Types
 *
 * Simple types for declaring what database schema an action requires.
 * Used for:
 * - Runtime validation (refuse to run if tables missing)
 * - Import-time checking (compare to target DB)
 * - DDL generation (create missing tables)
 *
 * Compile-time validation is handled by Kysely types + TypeScript.
 */

// =============================================================================
// Column Types
// =============================================================================

/**
 * SQLite-compatible column types
 */
export type ColumnType = "TEXT" | "INTEGER" | "REAL" | "BOOLEAN" | "TIMESTAMP" | "JSON";

/**
 * Column in a schema declaration
 */
export interface SchemaColumn {
  /** Column name */
  name: string;

  /** SQL type */
  type: ColumnType;

  /** If true, action can work without this column */
  optional?: boolean;
}

// =============================================================================
// Table Types
// =============================================================================

/**
 * Table in a schema declaration
 */
export interface SchemaTable {
  /** Table name */
  name: string;

  /** Required and optional columns */
  columns: SchemaColumn[];

  /** Primary key column(s) */
  primaryKey?: string[];
}

// =============================================================================
// Action Schema
// =============================================================================

/**
 * Schema requirements declared by an action.
 *
 * @example
 * ```typescript
 * defineAction({
 *   name: "sync-orders",
 *   schema: {
 *     tables: [{
 *       name: "orders",
 *       columns: [
 *         { name: "id", type: "TEXT" },
 *         { name: "total", type: "REAL" },
 *       ],
 *       primaryKey: ["id"],
 *     }],
 *   },
 *   run: async (input, ctx) => { ... },
 * });
 * ```
 */
export interface ActionSchema {
  tables: SchemaTable[];
}

// =============================================================================
// Database Schema (from /db/schema endpoint)
// =============================================================================

/**
 * Column info returned by /db/schema
 */
export interface DbColumn {
  name: string;
  type: string;
  nullable: boolean;
  isPrimary: boolean;
}

/**
 * Table info returned by /db/schema
 */
export interface DbTable {
  name: string;
  columns: DbColumn[];
}

/**
 * Full database schema from /db/schema
 */
export interface DbSchema {
  tables: DbTable[];
}

// =============================================================================
// Validation Result
// =============================================================================

/**
 * Result of validating action schema against database
 */
export interface SchemaValidationResult {
  valid: boolean;
  missingTables: string[];
  missingColumns: Array<{ table: string; column: string }>;
  errors: string[];
}
