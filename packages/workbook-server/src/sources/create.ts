/**
 * Source Creation - Core Module
 *
 * Shared logic for creating sources from remote Postgres or local-only.
 * Used by both CLI (`hands sources add`) and runtime API routes.
 *
 * Flow:
 * 1. Connect to remote Postgres (if --from provided)
 * 2. Introspect schema for selected tables
 * 3. Create matching tables in local PGlite
 * 4. Generate source.ts with subscription config
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { PGlite } from "@electric-sql/pglite";

// ============================================================================
// Types
// ============================================================================

export interface CreateSourceOptions {
  /** Source name (directory name under sources/) */
  name: string;
  /** Remote Postgres connection string (optional - omit for local-only) */
  from?: string;
  /** Tables to sync from remote (required if `from` is provided) */
  tables?: string[];
  /** WHERE clause filter for Electric-SQL shapes */
  where?: string;
  /** Description for the source */
  description?: string;
}

export interface CreateSourceResult {
  success: boolean;
  sourcePath?: string;
  tables?: TableIntrospection[];
  error?: string;
}

export interface TableIntrospection {
  name: string;
  columns: ColumnIntrospection[];
  primaryKey?: string[];
}

export interface ColumnIntrospection {
  name: string;
  type: string;
  nullable: boolean;
  defaultValue?: string;
  isPrimaryKey: boolean;
}

export interface IntrospectRemoteOptions {
  connectionString: string;
  tables: string[];
}

export interface IntrospectRemoteResult {
  success: boolean;
  tables?: TableIntrospection[];
  error?: string;
}

// ============================================================================
// Remote Postgres Introspection
// ============================================================================

/**
 * Introspect tables from a remote Postgres database
 */
export async function introspectRemotePostgres(
  options: IntrospectRemoteOptions,
): Promise<IntrospectRemoteResult> {
  const { connectionString, tables } = options;

  try {
    // Dynamic import pg to avoid bundling issues
    const { default: pg } = await import("pg");
    const client = new pg.Client({ connectionString });

    await client.connect();

    const result: TableIntrospection[] = [];

    for (const tableName of tables) {
      // Get columns
      const columnsQuery = await client.query(
        `
        SELECT
          column_name,
          data_type,
          is_nullable,
          column_default,
          udt_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = $1
        ORDER BY ordinal_position
      `,
        [tableName],
      );

      if (columnsQuery.rows.length === 0) {
        await client.end();
        return {
          success: false,
          error: `Table '${tableName}' not found in remote database`,
        };
      }

      // Get primary key columns
      const pkQuery = await client.query(
        `
        SELECT kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        WHERE tc.constraint_type = 'PRIMARY KEY'
          AND tc.table_schema = 'public'
          AND tc.table_name = $1
        ORDER BY kcu.ordinal_position
      `,
        [tableName],
      );

      const pkColumns = new Set(pkQuery.rows.map((r: { column_name: string }) => r.column_name));

      interface ColumnRow {
        column_name: string;
        data_type: string;
        is_nullable: string;
        column_default: string | null;
        udt_name: string;
      }

      const columns: ColumnIntrospection[] = columnsQuery.rows.map((row: ColumnRow) => ({
        name: row.column_name,
        type: normalizePostgresType(row.data_type, row.udt_name),
        nullable: row.is_nullable === "YES",
        defaultValue: row.column_default ?? undefined,
        isPrimaryKey: pkColumns.has(row.column_name),
      }));

      result.push({
        name: tableName,
        columns,
        primaryKey: pkColumns.size > 0 ? (Array.from(pkColumns) as string[]) : undefined,
      });
    }

    await client.end();

    return { success: true, tables: result };
  } catch (err) {
    return {
      success: false,
      error: `Failed to connect to remote Postgres: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Normalize Postgres type names for DDL generation
 */
function normalizePostgresType(dataType: string, udtName: string): string {
  // Handle array types
  if (dataType === "ARRAY") {
    // udt_name for arrays is like "_int4" for integer[]
    const baseType = udtName.replace(/^_/, "");
    return `${mapUdtToSql(baseType)}[]`;
  }

  // Map common types
  switch (dataType.toLowerCase()) {
    case "character varying":
      return "VARCHAR";
    case "character":
      return "CHAR";
    case "timestamp without time zone":
      return "TIMESTAMP";
    case "timestamp with time zone":
      return "TIMESTAMPTZ";
    case "time without time zone":
      return "TIME";
    case "time with time zone":
      return "TIMETZ";
    case "double precision":
      return "DOUBLE PRECISION";
    default:
      return dataType.toUpperCase();
  }
}

function mapUdtToSql(udtName: string): string {
  switch (udtName) {
    case "int4":
      return "INTEGER";
    case "int8":
      return "BIGINT";
    case "int2":
      return "SMALLINT";
    case "float4":
      return "REAL";
    case "float8":
      return "DOUBLE PRECISION";
    case "bool":
      return "BOOLEAN";
    default:
      return udtName.toUpperCase();
  }
}

// ============================================================================
// DDL Generation
// ============================================================================

/**
 * Generate CREATE TABLE DDL from introspected schema
 */
export function generateCreateTableDDL(table: TableIntrospection): string {
  const lines: string[] = [`CREATE TABLE IF NOT EXISTS ${table.name} (`];

  const columnDefs: string[] = [];
  for (const col of table.columns) {
    let def = `  ${col.name} ${col.type}`;
    if (!col.nullable) {
      def += " NOT NULL";
    }
    if (col.defaultValue && !col.defaultValue.includes("nextval")) {
      // Skip sequence defaults - PGlite will handle them differently
      def += ` DEFAULT ${col.defaultValue}`;
    }
    columnDefs.push(def);
  }

  // Add primary key constraint
  if (table.primaryKey && table.primaryKey.length > 0) {
    columnDefs.push(`  PRIMARY KEY (${table.primaryKey.join(", ")})`);
  }

  lines.push(columnDefs.join(",\n"));
  lines.push(");");

  return lines.join("\n");
}

// ============================================================================
// Source File Generation
// ============================================================================

/**
 * Generate source.ts content
 */
export function generateSourceFile(options: {
  name: string;
  description?: string;
  tables: string[];
  hasSubscription: boolean;
  where?: string;
}): string {
  const { name, description, tables, hasSubscription, where } = options;

  const tableEntries = tables
    .map((tableName) => {
      if (hasSubscription) {
        const whereClause = where ? `\n        where: "${where}",` : "";
        return `    ${tableName}: {
      subscription: {
        url: process.env.ELECTRIC_URL!,
        table: "${tableName}",${whereClause}
      },
    }`;
      } else {
        return `    ${tableName}: {
      // Local-only table
    }`;
      }
    })
    .join(",\n");

  return `/**
 * Source: ${name}
 * ${hasSubscription ? "Synced from remote Postgres via Electric-SQL" : "Local-only tables"}
 *
 * AUTO-GENERATED by \`hands sources add\`
 * You can modify subscription config but schema is managed by the database.
 */

import { defineSourceV2 } from "@hands/stdlib/sources"

export default defineSourceV2({
  name: "${name}",
  description: "${description || `Tables for ${name}`}",
  tables: {
${tableEntries}
  },
})
`;
}

// ============================================================================
// Main Creation Logic
// ============================================================================

/**
 * Create a new source in a workbook
 *
 * This is the core function used by both CLI and API routes.
 */
export async function createSource(
  workbookDir: string,
  db: PGlite,
  options: CreateSourceOptions,
): Promise<CreateSourceResult> {
  const { name, from, tables, where, description } = options;

  // Validate source name
  if (!/^[a-z][a-z0-9_-]*$/.test(name)) {
    return {
      success: false,
      error:
        "Source name must start with lowercase letter and contain only lowercase letters, numbers, hyphens, underscores",
    };
  }

  // Check if source already exists
  const sourcePath = join(workbookDir, "sources", name);
  if (existsSync(sourcePath)) {
    return {
      success: false,
      error: `Source '${name}' already exists at ${sourcePath}`,
    };
  }

  let introspectedTables: TableIntrospection[] = [];

  // If remote connection provided, introspect and create tables
  if (from) {
    if (!tables || tables.length === 0) {
      return {
        success: false,
        error: "Must specify --tables when using --from",
      };
    }

    // Introspect remote
    const introspectResult = await introspectRemotePostgres({
      connectionString: from,
      tables,
    });

    if (!introspectResult.success) {
      return {
        success: false,
        error: introspectResult.error,
      };
    }

    introspectedTables = introspectResult.tables!;

    // Create tables in local PGlite
    for (const table of introspectedTables) {
      const ddl = generateCreateTableDDL(table);
      try {
        await db.exec(ddl);
      } catch (err) {
        // Table might already exist - that's OK
        const errMsg = err instanceof Error ? err.message : String(err);
        if (!errMsg.includes("already exists")) {
          return {
            success: false,
            error: `Failed to create table '${table.name}': ${errMsg}`,
          };
        }
      }
    }
  } else if (tables && tables.length > 0) {
    // Local-only source with existing tables - just validate they exist
    for (const tableName of tables) {
      const result = await db.query<{ exists: boolean }>(
        `SELECT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = $1
        ) as exists`,
        [tableName],
      );
      if (!result.rows[0]?.exists) {
        return {
          success: false,
          error: `Table '${tableName}' does not exist in local database`,
        };
      }
    }
  }

  // Create source directory
  mkdirSync(sourcePath, { recursive: true });

  // Generate source.ts
  const sourceContent = generateSourceFile({
    name,
    description,
    tables: tables || [],
    hasSubscription: !!from,
    where,
  });

  writeFileSync(join(sourcePath, "source.ts"), sourceContent);

  // Update .env.local with ELECTRIC_URL placeholder if needed
  if (from) {
    const envPath = join(workbookDir, ".env.local");
    let envContent = "";
    if (existsSync(envPath)) {
      envContent = readFileSync(envPath, "utf-8");
    }
    if (!envContent.includes("ELECTRIC_URL=")) {
      const electricUrl = `# Electric-SQL sync URL (replace with your Electric service)\nELECTRIC_URL=http://localhost:5133\n`;
      writeFileSync(envPath, `${envContent}\n${electricUrl}`);
    }
  }

  return {
    success: true,
    sourcePath,
    tables: introspectedTables,
  };
}

// ============================================================================
// List Remote Tables (for UI)
// ============================================================================

/**
 * List all tables in a remote Postgres database
 * Useful for UI to show available tables before selection
 */
export async function listRemoteTables(
  connectionString: string,
): Promise<{ success: boolean; tables?: string[]; error?: string }> {
  try {
    const { default: pg } = await import("pg");
    const client = new pg.Client({ connectionString });

    await client.connect();

    const result = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);

    await client.end();

    return {
      success: true,
      tables: result.rows.map((r: { table_name: string }) => r.table_name),
    };
  } catch (err) {
    return {
      success: false,
      error: `Failed to connect: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
