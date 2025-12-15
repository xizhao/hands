/**
 * SQLite Schema Introspection and TypeScript Codegen
 *
 * Queries SQLite's schema tables and generates typed schema.ts
 */

interface ColumnInfo {
  table_name: string;
  column_name: string;
  data_type: string;
  is_nullable: boolean;
  column_default: string | null;
  is_primary: boolean;
}

interface TableInfo {
  name: string;
  columns: ColumnInfo[];
}

/**
 * Map SQLite types to TypeScript types
 */
function sqliteTypeToTs(sqliteType: string, nullable: boolean): string {
  let tsType: string;

  // SQLite uses type affinity - normalize the type
  const upperType = sqliteType.toUpperCase();

  if (upperType.includes("INT")) {
    tsType = "number";
  } else if (upperType.includes("REAL") || upperType.includes("FLOAT") || upperType.includes("DOUBLE")) {
    tsType = "number";
  } else if (upperType.includes("BOOL")) {
    tsType = "boolean";
  } else if (upperType.includes("JSON")) {
    tsType = "Record<string, unknown>";
  } else if (
    upperType.includes("CHAR") ||
    upperType.includes("TEXT") ||
    upperType.includes("CLOB") ||
    upperType.includes("VARCHAR")
  ) {
    tsType = "string";
  } else if (upperType.includes("BLOB") || upperType === "") {
    tsType = "Uint8Array";
  } else if (upperType.includes("DATE") || upperType.includes("TIME")) {
    tsType = "string"; // SQLite stores dates as TEXT, INTEGER, or REAL
  } else if (upperType === "NUMERIC" || upperType === "DECIMAL") {
    tsType = "number";
  } else {
    // SQLite's flexible typing - default to unknown
    tsType = "unknown";
  }

  return nullable ? `${tsType} | null` : tsType;
}

/**
 * Convert snake_case to PascalCase
 */
function toPascalCase(str: string): string {
  return str
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join("");
}

/**
 * SQLite database interface for introspection
 */
export interface SQLiteDatabase {
  exec<T = unknown>(sql: string): T[];
}

/**
 * Introspect SQLite database schema
 */
export async function introspectSchema(db: SQLiteDatabase): Promise<TableInfo[]> {
  // Get all user tables (not sqlite_ internal tables)
  const tables = db.exec<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
  );

  const result: TableInfo[] = [];

  for (const table of tables) {
    // Use PRAGMA to get column info
    const columns = db.exec<{
      cid: number;
      name: string;
      type: string;
      notnull: number;
      dflt_value: string | null;
      pk: number;
    }>(`PRAGMA table_info("${table.name}")`);

    result.push({
      name: table.name,
      columns: columns.map((col) => ({
        table_name: table.name,
        column_name: col.name,
        data_type: col.type,
        is_nullable: col.notnull === 0,
        column_default: col.dflt_value,
        is_primary: col.pk > 0,
      })),
    });
  }

  return result;
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
  ];

  if (tables.length === 0) {
    lines.push("// No tables found in database");
    lines.push("");
    lines.push("export interface Tables {}");
    lines.push("");
    lines.push("export type TableName = never;");
    return lines.join("\n");
  }

  // Generate interface for each table
  for (const table of tables) {
    const typeName = toPascalCase(table.name);
    lines.push(`export interface ${typeName} {`);

    for (const col of table.columns) {
      const tsType = sqliteTypeToTs(col.data_type, col.is_nullable);
      lines.push(`  ${col.column_name}: ${tsType};`);
    }

    lines.push("}");
    lines.push("");
  }

  // Generate Tables map
  lines.push("export interface Tables {");
  for (const table of tables) {
    const typeName = toPascalCase(table.name);
    lines.push(`  ${table.name}: ${typeName};`);
  }
  lines.push("}");
  lines.push("");

  // Generate TableName union
  const tableNames = tables.map((t) => `"${t.name}"`).join(" | ");
  lines.push(`export type TableName = ${tableNames};`);
  lines.push("");

  return lines.join("\n");
}

/**
 * Full pipeline: introspect DB and generate schema.ts content
 */
export async function generateSchema(db: SQLiteDatabase): Promise<string> {
  const tables = await introspectSchema(db);
  return generateSchemaTs(tables);
}

/**
 * Generate SQL CREATE TABLE statements from introspected schema
 */
export function generateSchemaSQL(tables: TableInfo[]): string {
  const lines: string[] = [
    "-- Auto-generated schema.sql",
    "-- DO NOT EDIT - regenerated on schema changes",
    "",
  ];

  if (tables.length === 0) {
    lines.push("-- No tables found in database");
    return lines.join("\n");
  }

  for (const table of tables) {
    lines.push(`CREATE TABLE ${table.name} (`);

    const columnDefs: string[] = [];
    for (const col of table.columns) {
      const nullable = col.is_nullable ? "" : " NOT NULL";
      const defaultVal = col.column_default ? ` DEFAULT ${col.column_default}` : "";
      const primary = col.is_primary ? " PRIMARY KEY" : "";
      columnDefs.push(`  ${col.column_name} ${col.data_type || "TEXT"}${primary}${nullable}${defaultVal}`);
    }

    lines.push(columnDefs.join(",\n"));
    lines.push(");");
    lines.push("");
  }

  return lines.join("\n");
}
