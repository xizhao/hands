/**
 * DDL Generator
 *
 * Generate CREATE TABLE statements from schema declarations.
 */

import type { SchemaTable, ColumnType } from "@hands/core/primitives";

/**
 * Map ColumnType to SQLite type
 */
function columnTypeToSQL(type: ColumnType): string {
  const mapping: Record<ColumnType, string> = {
    TEXT: "TEXT",
    INTEGER: "INTEGER",
    REAL: "REAL",
    BOOLEAN: "INTEGER", // SQLite uses 0/1
    TIMESTAMP: "TEXT", // SQLite stores as ISO string
    JSON: "TEXT", // SQLite stores as JSON string
  };
  return mapping[type];
}

/**
 * Generate CREATE TABLE statement for a schema table
 */
export function generateCreateTable(table: SchemaTable): string {
  const columnDefs: string[] = [];

  for (const col of table.columns) {
    let def = `"${col.name}" ${columnTypeToSQL(col.type)}`;
    if (!col.optional) {
      def += " NOT NULL";
    }
    columnDefs.push(def);
  }

  // Add primary key constraint
  if (table.primaryKey && table.primaryKey.length > 0) {
    const pkCols = table.primaryKey.map((c) => `"${c}"`).join(", ");
    columnDefs.push(`PRIMARY KEY (${pkCols})`);
  }

  const columnSQL = columnDefs.map((d) => `  ${d}`).join(",\n");
  return `CREATE TABLE IF NOT EXISTS "${table.name}" (\n${columnSQL}\n);`;
}

/**
 * Generate CREATE TABLE statements for all tables in schema
 */
export function generateCreateTables(tables: SchemaTable[]): string[] {
  return tables.map(generateCreateTable);
}
