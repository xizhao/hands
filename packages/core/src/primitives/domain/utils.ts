/**
 * Domain Utility Functions
 *
 * Helpers for schema hashing, relation table detection, and name formatting.
 */

import type { DomainColumn, DomainForeignKey, DomainSchema, RelationTableDetection } from "./types";

// =============================================================================
// Schema Hashing
// =============================================================================

/**
 * Generate a stable hash from a domain schema.
 * Used for detecting schema changes.
 */
export function generateSchemaHash(schema: DomainSchema): string {
  // Create a stable representation of the schema
  const normalized = {
    table: schema.tableName,
    columns: schema.columns
      .map((c) => `${c.name}:${c.type}:${c.nullable}:${c.isPrimary}`)
      .sort()
      .join("|"),
    fks: schema.foreignKeys
      .map((fk) => `${fk.column}->${fk.referencedTable}.${fk.referencedColumn}`)
      .sort()
      .join("|"),
  };

  const str = JSON.stringify(normalized);

  // Simple hash function (djb2)
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}

// =============================================================================
// Relation Table Detection
// =============================================================================

/** Common patterns in junction/relation table names */
const JUNCTION_PATTERNS = [
  /_to_/i,
  /_x_/i,
  /_rel_/i,
  /_link_/i,
  /_map_/i,
  /_join_/i,
  /_bridge_/i,
  /_assoc_/i,
];

/**
 * Detect if a table is a relation/junction table.
 * These are excluded from domains.
 */
export function detectRelationTable(
  tableName: string,
  columns: DomainColumn[],
  foreignKeys: DomainForeignKey[],
  allTableNames: string[],
): RelationTableDetection {
  // Check for junction naming patterns
  for (const pattern of JUNCTION_PATTERNS) {
    if (pattern.test(tableName)) {
      return {
        isRelation: true,
        reason: `Table name matches junction pattern: ${pattern}`,
      };
    }
  }

  // Check if table name is combination of two other tables
  // e.g., "users_roles" connects "users" and "roles"
  for (const table1 of allTableNames) {
    for (const table2 of allTableNames) {
      if (table1 === table2 || table1 === tableName || table2 === tableName) {
        continue;
      }

      // Check both orderings
      const combo1 = `${table1}_${table2}`;
      const combo2 = `${table2}_${table1}`;

      if (tableName === combo1 || tableName === combo2) {
        return {
          isRelation: true,
          reason: `Table name is combination of ${table1} and ${table2}`,
          connectsTables: [table1, table2],
        };
      }
    }
  }

  // Check if table has exactly 2 FKs and minimal other columns
  // (typical junction table pattern)
  if (foreignKeys.length === 2) {
    const nonFkColumns = columns.filter(
      (col) => !foreignKeys.some((fk) => fk.column === col.name) && !col.isPrimary,
    );

    // If only has FK columns + optional timestamps/id, likely a junction
    const isMinimalJunction =
      nonFkColumns.length <= 2 &&
      nonFkColumns.every((col) =>
        ["created_at", "updated_at", "id", "created", "modified"].includes(col.name.toLowerCase()),
      );

    if (isMinimalJunction) {
      return {
        isRelation: true,
        reason: "Table has 2 foreign keys with minimal other columns",
        connectsTables: [foreignKeys[0].referencedTable, foreignKeys[1].referencedTable],
      };
    }
  }

  return { isRelation: false };
}

// =============================================================================
// Name Formatting
// =============================================================================

/**
 * Convert a table name to a display name.
 * e.g., "user_profiles" -> "User Profiles"
 */
export function toDisplayName(tableName: string): string {
  return tableName
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Convert a display name back to a table name.
 * e.g., "User Profiles" -> "user_profiles"
 */
export function toTableName(displayName: string): string {
  return displayName
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

// =============================================================================
// Page Matching
// =============================================================================

/**
 * Find the page path that matches a domain.
 * Pages are matched by:
 * 1. Frontmatter `domain` field matching table name
 * 2. Page filename matching table name
 */
export function matchPageToDomain(
  tableName: string,
  pages: Array<{ id: string; path: string; frontmatter?: { domain?: string } }>,
): { path: string; id: string } | null {
  // First, try to match by frontmatter domain field
  const byFrontmatter = pages.find(
    (p) => p.frontmatter?.domain?.toLowerCase() === tableName.toLowerCase(),
  );
  if (byFrontmatter) {
    return { path: byFrontmatter.path, id: byFrontmatter.id };
  }

  // Then, try to match by page ID/filename
  const byFilename = pages.find(
    (p) =>
      p.id.toLowerCase() === tableName.toLowerCase() ||
      p.id.toLowerCase().replace(/-/g, "_") === tableName.toLowerCase(),
  );
  if (byFilename) {
    return { path: byFilename.path, id: byFilename.id };
  }

  return null;
}

// =============================================================================
// Schema Comparison
// =============================================================================

/**
 * Compare two schemas and return the differences.
 */
export function compareSchemas(
  current: DomainSchema,
  stored: DomainSchema,
): Array<{
  type: "column_added" | "column_removed" | "column_modified" | "type_changed";
  column: string;
  previous?: string;
  current?: string;
}> {
  const changes: Array<{
    type: "column_added" | "column_removed" | "column_modified" | "type_changed";
    column: string;
    previous?: string;
    current?: string;
  }> = [];

  const currentCols = new Map(current.columns.map((c) => [c.name, c]));
  const storedCols = new Map(stored.columns.map((c) => [c.name, c]));

  // Find added columns
  for (const [name, col] of currentCols) {
    if (!storedCols.has(name)) {
      changes.push({
        type: "column_added",
        column: name,
        current: col.type,
      });
    }
  }

  // Find removed columns
  for (const [name, col] of storedCols) {
    if (!currentCols.has(name)) {
      changes.push({
        type: "column_removed",
        column: name,
        previous: col.type,
      });
    }
  }

  // Find modified columns
  for (const [name, currentCol] of currentCols) {
    const storedCol = storedCols.get(name);
    if (storedCol) {
      if (currentCol.type !== storedCol.type) {
        changes.push({
          type: "type_changed",
          column: name,
          previous: storedCol.type,
          current: currentCol.type,
        });
      } else if (
        currentCol.nullable !== storedCol.nullable ||
        currentCol.isPrimary !== storedCol.isPrimary
      ) {
        changes.push({
          type: "column_modified",
          column: name,
          previous: `nullable=${storedCol.nullable}, pk=${storedCol.isPrimary}`,
          current: `nullable=${currentCol.nullable}, pk=${currentCol.isPrimary}`,
        });
      }
    }
  }

  return changes;
}
