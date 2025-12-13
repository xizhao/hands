/**
 * Type Generator for pgtyped-compatible .types.ts files
 *
 * Generates TypeScript interfaces from SQL queries using schema introspection.
 * Works with PGlite directly - no TCP connection required.
 */

import type { PGlite } from "@electric-sql/pglite"
import { introspectSchema } from "../schema-gen.js"
import type { ExtractedQuery, ParsedFile } from "./parser.js"
import type { Param, ParamType } from "@pgtyped/parser"

interface ColumnInfo {
  table_name: string
  column_name: string
  data_type: string
  is_nullable: string
}

interface SchemaMap {
  tables: Map<string, Map<string, { type: string; nullable: boolean }>>
}

/**
 * Map Postgres types to TypeScript types (same as schema-gen.ts)
 */
function pgTypeToTs(pgType: string): string {
  switch (pgType.toLowerCase()) {
    case "integer":
    case "smallint":
    case "bigint":
    case "numeric":
    case "real":
    case "double precision":
    case "serial":
    case "bigserial":
      return "number"
    case "boolean":
      return "boolean"
    case "json":
    case "jsonb":
      return "Record<string, unknown>"
    case "timestamp with time zone":
    case "timestamp without time zone":
    case "date":
    case "time":
      return "Date | string"
    case "uuid":
    case "text":
    case "varchar":
    case "character varying":
    case "char":
    case "character":
      return "string"
    case "bytea":
      return "Uint8Array"
    default:
      if (pgType.endsWith("[]")) return "unknown[]"
      return "unknown"
  }
}

/**
 * Build schema map from PGlite introspection
 */
async function buildSchemaMap(db: PGlite): Promise<SchemaMap> {
  const tables = await introspectSchema(db)
  const schemaMap: SchemaMap = { tables: new Map() }

  for (const table of tables) {
    const columns = new Map<string, { type: string; nullable: boolean }>()
    for (const col of table.columns) {
      columns.set(col.column_name, {
        type: pgTypeToTs(col.data_type),
        nullable: col.is_nullable === "YES",
      })
    }
    schemaMap.tables.set(table.name, columns)
  }

  return schemaMap
}

/**
 * Convert snake_case to PascalCase
 */
function toPascalCase(str: string): string {
  return str
    .split(/[_-]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join("")
}

/**
 * Infer parameter type from pgtyped Param
 */
function getParamType(param: Param): string {
  const sel = param.selection
  if (sel.type === "scalar") return "unknown"
  if (sel.type === "scalar_array") return "unknown[]"
  if (sel.type === "object" || sel.type === "object_array") {
    const keys = sel.keys.map((k) => `${k.name}: unknown`).join("; ")
    return sel.type === "object" ? `{ ${keys} }` : `{ ${keys} }[]`
  }
  return "unknown"
}

/**
 * Parse SELECT query to extract column information
 * Basic parser for common patterns
 */
function parseSelectColumns(sql: string, schema: SchemaMap): Array<{ name: string; type: string; nullable: boolean }> {
  const results: Array<{ name: string; type: string; nullable: boolean }> = []

  // Basic regex to find SELECT ... FROM pattern
  const selectMatch = sql.match(/SELECT\s+([\s\S]+?)\s+FROM\s+(\w+)/i)
  if (!selectMatch) return results

  const columns = selectMatch[1]
  const tableName = selectMatch[2].toLowerCase()

  const tableSchema = schema.tables.get(tableName)
  if (!tableSchema) return results

  // Handle SELECT *
  if (columns.trim() === "*") {
    for (const [colName, info] of tableSchema) {
      results.push({ name: colName, type: info.type, nullable: info.nullable })
    }
    return results
  }

  // Parse individual columns
  const colParts = columns.split(",").map((c) => c.trim())
  for (const col of colParts) {
    // Handle "column AS alias" or just "column"
    const asMatch = col.match(/^(\w+)(?:\s+AS\s+(\w+))?$/i)
    if (asMatch) {
      const colName = asMatch[1].toLowerCase()
      const alias = asMatch[2]?.toLowerCase() || colName
      const info = tableSchema.get(colName)
      if (info) {
        results.push({ name: alias, type: info.type, nullable: info.nullable })
      } else {
        // Unknown column (might be expression)
        results.push({ name: alias, type: "unknown", nullable: true })
      }
    }
  }

  return results
}

/**
 * Infer return type from SQL query
 */
function inferReturnType(sql: string, schema: SchemaMap): string {
  const upperSql = sql.toUpperCase().trim()

  // INSERT/UPDATE/DELETE return affected rows or nothing
  if (upperSql.startsWith("INSERT")) {
    // Check for RETURNING clause
    if (upperSql.includes("RETURNING")) {
      const columns = parseSelectColumns(sql.replace(/INSERT[\s\S]+RETURNING/i, "SELECT ").replace(/$/i, " FROM dual"), schema)
      if (columns.length > 0) {
        const props = columns.map((c) => `${c.name}: ${c.type}${c.nullable ? " | null" : ""}`).join("; ")
        return `{ ${props} }`
      }
    }
    return "void"
  }

  if (upperSql.startsWith("UPDATE") || upperSql.startsWith("DELETE")) {
    if (upperSql.includes("RETURNING")) {
      return "unknown" // TODO: parse RETURNING clause
    }
    return "void"
  }

  if (upperSql.startsWith("SELECT")) {
    const columns = parseSelectColumns(sql, schema)
    if (columns.length > 0) {
      const props = columns.map((c) => `${c.name}: ${c.type}${c.nullable ? " | null" : ""}`).join("; ")
      return `{ ${props} }`
    }
    return "unknown"
  }

  return "void"
}

/**
 * Generate TypeScript type definitions for a single query
 */
function generateQueryTypes(query: ExtractedQuery, schema: SchemaMap): string {
  const typeName = toPascalCase(query.name)
  const lines: string[] = []

  // Generate params interface
  const paramProps: string[] = []
  for (const param of query.params) {
    const optional = !param.required ? "?" : ""
    paramProps.push(`  ${param.name}${optional}: ${getParamType(param)}`)
  }

  lines.push(`export interface I${typeName}Params {`)
  if (paramProps.length > 0) {
    lines.push(paramProps.join("\n"))
  }
  lines.push("}")
  lines.push("")

  // Generate result interface
  const returnType = inferReturnType(query.sql, schema)
  lines.push(`export interface I${typeName}Result ${returnType === "void" ? "{}" : returnType}`)
  lines.push("")

  // Generate query type (combining params and result)
  lines.push(`export interface I${typeName}Query {`)
  lines.push(`  params: I${typeName}Params`)
  lines.push(`  result: I${typeName}Result`)
  lines.push("}")
  lines.push("")

  return lines.join("\n")
}

/**
 * Generate a complete .types.ts file for a parsed source file
 */
export function generateTypesFile(parsed: ParsedFile, schema: SchemaMap): string {
  const lines: string[] = [
    "/**",
    " * Auto-generated by pgtyped. Do not edit.",
    ` * Source: ${parsed.filePath}`,
    " */",
    "",
  ]

  if (parsed.queries.length === 0) {
    lines.push("// No SQL queries found in this file")
    return lines.join("\n")
  }

  for (const query of parsed.queries) {
    lines.push(generateQueryTypes(query, schema))
  }

  return lines.join("\n")
}

/**
 * Generate types for multiple files
 */
export async function generateTypesForFiles(
  files: ParsedFile[],
  db: PGlite
): Promise<Map<string, string>> {
  const schema = await buildSchemaMap(db)
  const results = new Map<string, string>()

  for (const file of files) {
    if (file.queries.length > 0) {
      const typesContent = generateTypesFile(file, schema)
      // Output file: same dir, .types.ts extension
      const typesPath = file.filePath.replace(/\.(tsx?|jsx?)$/, ".types.ts")
      results.set(typesPath, typesContent)
    }
  }

  return results
}

export { buildSchemaMap, type SchemaMap }
