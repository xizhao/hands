/**
 * Schema introspection and TypeScript codegen
 *
 * Queries PGLite's information_schema and generates typed schema.ts
 */

import type { PGlite } from "@electric-sql/pglite"

interface ColumnInfo {
  table_name: string
  column_name: string
  data_type: string
  is_nullable: string
  column_default: string | null
}

interface TableInfo {
  name: string
  columns: ColumnInfo[]
}

/**
 * Map Postgres types to TypeScript types
 */
function pgTypeToTs(pgType: string, nullable: boolean): string {
  let tsType: string

  switch (pgType) {
    case "integer":
    case "smallint":
    case "bigint":
    case "numeric":
    case "real":
    case "double precision":
      tsType = "number"
      break
    case "boolean":
      tsType = "boolean"
      break
    case "json":
    case "jsonb":
      tsType = "Record<string, unknown>"
      break
    case "timestamp with time zone":
    case "timestamp without time zone":
    case "date":
    case "time":
      tsType = "string" // ISO strings
      break
    case "uuid":
    case "text":
    case "varchar":
    case "character varying":
    case "char":
    case "character":
      tsType = "string"
      break
    case "bytea":
      tsType = "Uint8Array"
      break
    case "ARRAY":
      tsType = "unknown[]"
      break
    default:
      tsType = "unknown"
  }

  return nullable ? `${tsType} | null` : tsType
}

/**
 * Convert snake_case to PascalCase
 */
function toPascalCase(str: string): string {
  return str
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join("")
}

/**
 * Introspect database schema
 */
export async function introspectSchema(db: PGlite): Promise<TableInfo[]> {
  const result = await db.query<ColumnInfo>(`
    SELECT
      c.table_name,
      c.column_name,
      c.data_type,
      c.is_nullable,
      c.column_default
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON c.table_name = t.table_name
      AND c.table_schema = t.table_schema
    WHERE c.table_schema = 'public'
      AND t.table_type = 'BASE TABLE'
    ORDER BY c.table_name, c.ordinal_position
  `)

  // Group by table
  const tables = new Map<string, ColumnInfo[]>()
  for (const row of result.rows) {
    const cols = tables.get(row.table_name) || []
    cols.push(row)
    tables.set(row.table_name, cols)
  }

  return Array.from(tables.entries()).map(([name, columns]) => ({
    name,
    columns,
  }))
}

/**
 * Generate TypeScript schema file
 */
export function generateSchemaTs(tables: TableInfo[]): string {
  const lines: string[] = [
    "/**",
    " * Auto-generated database schema types",
    " * DO NOT EDIT - regenerated on schema changes",
    " */",
    "",
  ]

  if (tables.length === 0) {
    lines.push("// No tables found in database")
    lines.push("")
    lines.push("export interface Tables {}")
    lines.push("")
    lines.push("export type TableName = never")
    return lines.join("\n")
  }

  // Generate interface for each table
  for (const table of tables) {
    const typeName = toPascalCase(table.name)
    lines.push(`export interface ${typeName} {`)

    for (const col of table.columns) {
      const nullable = col.is_nullable === "YES"
      const tsType = pgTypeToTs(col.data_type, nullable)
      lines.push(`  ${col.column_name}: ${tsType}`)
    }

    lines.push("}")
    lines.push("")
  }

  // Generate Tables map
  lines.push("export interface Tables {")
  for (const table of tables) {
    const typeName = toPascalCase(table.name)
    lines.push(`  ${table.name}: ${typeName}`)
  }
  lines.push("}")
  lines.push("")

  // Generate TableName union
  const tableNames = tables.map((t) => `"${t.name}"`).join(" | ")
  lines.push(`export type TableName = ${tableNames}`)
  lines.push("")

  return lines.join("\n")
}

/**
 * Full pipeline: introspect DB and generate schema.ts content
 */
export async function generateSchema(db: PGlite): Promise<string> {
  const tables = await introspectSchema(db)
  return generateSchemaTs(tables)
}

/**
 * Map TypeScript/pgType back to SQL type for CREATE TABLE
 */
function pgTypeToSQL(pgType: string): string {
  switch (pgType.toLowerCase()) {
    case "integer":
    case "smallint":
    case "bigint":
    case "numeric":
    case "real":
    case "double precision":
    case "serial":
    case "bigserial":
      return pgType.toUpperCase()
    case "boolean":
      return "BOOLEAN"
    case "json":
    case "jsonb":
      return pgType.toUpperCase()
    case "timestamp with time zone":
      return "TIMESTAMPTZ"
    case "timestamp without time zone":
      return "TIMESTAMP"
    case "date":
      return "DATE"
    case "time":
      return "TIME"
    case "uuid":
      return "UUID"
    case "text":
      return "TEXT"
    case "varchar":
    case "character varying":
      return "VARCHAR"
    case "char":
    case "character":
      return "CHAR"
    case "bytea":
      return "BYTEA"
    default:
      if (pgType.toLowerCase().includes("[]")) return pgType.toUpperCase()
      return pgType.toUpperCase()
  }
}

/**
 * Generate SQL CREATE TABLE statements from introspected schema
 * Used for debugging and documentation
 */
export function generateSchemaSQL(tables: TableInfo[]): string {
  const lines: string[] = [
    "-- Auto-generated schema.sql",
    "-- DO NOT EDIT - regenerated on schema changes",
    "",
  ]

  if (tables.length === 0) {
    lines.push("-- No tables found in database")
    return lines.join("\n")
  }

  for (const table of tables) {
    lines.push(`CREATE TABLE ${table.name} (`)

    const columnDefs: string[] = []
    for (const col of table.columns) {
      const nullable = col.is_nullable === "YES" ? "" : " NOT NULL"
      const defaultVal = col.column_default ? ` DEFAULT ${col.column_default}` : ""
      columnDefs.push(`  ${col.column_name} ${pgTypeToSQL(col.data_type)}${nullable}${defaultVal}`)
    }

    lines.push(columnDefs.join(",\n"))
    lines.push(");")
    lines.push("")
  }

  return lines.join("\n")
}

/**
 * Full pipeline: introspect DB and generate schema.sql content
 */
export async function generateSchemaSQLFromDb(db: PGlite): Promise<string> {
  const tables = await introspectSchema(db)
  return generateSchemaSQL(tables)
}
