/**
 * Source Discovery
 *
 * Discovers v2 sources (table containers) in a workbook directory.
 *
 * Directory structure:
 * - sources/<name>/source.ts with table definitions
 */

import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import type { SourceDefinitionV2 } from "@hands/stdlib/sources";
import type { DiscoveredSource, DiscoveredTable, TableColumn, TableSchema } from "./types.js";

/**
 * Discover all sources in a workbook
 */
export async function discoverSources(
  workbookDir: string,
  db?: PGlite,
): Promise<DiscoveredSource[]> {
  const sourcesDir = join(workbookDir, "sources");

  if (!existsSync(sourcesDir)) {
    return [];
  }

  const sources: DiscoveredSource[] = [];
  const entries = readdirSync(sourcesDir);

  for (const entry of entries) {
    const entryPath = join(sourcesDir, entry);

    // Skip files, only process directories
    if (!statSync(entryPath).isDirectory()) {
      continue;
    }

    // Skip hidden directories and special folders
    if (entry.startsWith(".") || entry.startsWith("_")) {
      continue;
    }

    const source = await discoverSource(entryPath, entry, db);
    if (source) {
      sources.push(source);
    }
  }

  return sources;
}

/**
 * Discover a single source (v2 - table container)
 */
async function discoverSource(
  sourceDir: string,
  sourceId: string,
  db?: PGlite,
): Promise<DiscoveredSource | null> {
  const sourcePath = join(sourceDir, "source.ts");
  if (!existsSync(sourcePath)) {
    return null;
  }

  try {
    const mod = await import(sourcePath);
    const definition = mod.default as SourceDefinitionV2 | undefined;

    if (definition?.name) {
      // Discover tables from DB if available
      const tables = db ? await discoverTablesForSource(db, sourceId, definition) : [];

      return {
        id: sourceId,
        path: sourcePath,
        definition,
        tables,
      };
    }
  } catch (err) {
    console.error(`[sources] Failed to load source ${sourceId}:`, err);
  }

  return null;
}

/**
 * Discover tables for a v2 source from the database
 */
async function discoverTablesForSource(
  db: PGlite,
  sourceId: string,
  definition: SourceDefinitionV2,
): Promise<DiscoveredTable[]> {
  const tables: DiscoveredTable[] = [];

  // Get all tables from DB
  const allTables = await introspectTables(db);

  // If source defines specific tables, use those
  if (definition.tables) {
    for (const [tableName, tableConfig] of Object.entries(definition.tables)) {
      const dbTable = allTables.find((t) => t.name === tableName);
      if (dbTable) {
        tables.push({
          name: tableName,
          source: sourceId,
          schema: dbTable.schema,
          subscription: tableConfig.subscription
            ? {
                ...tableConfig.subscription,
                status: { active: false },
              }
            : undefined,
        });
      }
    }
  }

  return tables;
}

/**
 * Introspect all tables from the database
 */
export async function introspectTables(
  db: PGlite,
): Promise<Array<{ name: string; schema: TableSchema }>> {
  const result = await db.query<{
    table_name: string;
    column_name: string;
    data_type: string;
    is_nullable: string;
    column_default: string | null;
  }>(`
    SELECT
      c.table_name,
      c.column_name,
      c.data_type,
      c.is_nullable,
      c.column_default
    FROM information_schema.columns c
    JOIN information_schema.tables t ON c.table_name = t.table_name
    WHERE t.table_schema = 'public'
      AND t.table_type = 'BASE TABLE'
    ORDER BY c.table_name, c.ordinal_position
  `);

  // Get primary keys
  const pkResult = await db.query<{
    table_name: string;
    column_name: string;
  }>(`
    SELECT
      tc.table_name,
      kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    WHERE tc.constraint_type = 'PRIMARY KEY'
      AND tc.table_schema = 'public'
  `);

  const primaryKeys = new Map<string, Set<string>>();
  for (const row of pkResult.rows) {
    if (!primaryKeys.has(row.table_name)) {
      primaryKeys.set(row.table_name, new Set());
    }
    primaryKeys.get(row.table_name)?.add(row.column_name);
  }

  // Group columns by table
  const tableMap = new Map<string, TableColumn[]>();
  for (const row of result.rows) {
    if (!tableMap.has(row.table_name)) {
      tableMap.set(row.table_name, []);
    }

    const isPK = primaryKeys.get(row.table_name)?.has(row.column_name) ?? false;

    tableMap.get(row.table_name)?.push({
      name: row.column_name,
      type: row.data_type,
      nullable: row.is_nullable === "YES",
      defaultValue: row.column_default ?? undefined,
      isPrimaryKey: isPK,
    });
  }

  const tables: Array<{ name: string; schema: TableSchema }> = [];
  for (const [name, columns] of tableMap) {
    const pkCols = primaryKeys.get(name);
    tables.push({
      name,
      schema: {
        columns,
        primaryKey: pkCols ? Array.from(pkCols) : undefined,
      },
    });
  }

  return tables;
}

/**
 * Get all tables not assigned to any source
 */
export async function getOrphanTables(
  db: PGlite,
  sources: DiscoveredSource[],
): Promise<Array<{ name: string; schema: TableSchema }>> {
  const allTables = await introspectTables(db);

  // Collect all table names from sources
  const assignedTables = new Set<string>();
  for (const source of sources) {
    for (const table of source.tables) {
      assignedTables.add(table.name);
    }
  }

  // Return tables not assigned to any source
  return allTables.filter((t) => !assignedTables.has(t.name));
}
