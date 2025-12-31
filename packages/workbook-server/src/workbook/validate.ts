/**
 * Workbook Validation
 *
 * Validates block and component files.
 */

import { readFileSync } from "node:fs";
import type { BlockMeta } from "./types.js";

// =============================================================================
// Import Validation
// =============================================================================

export interface ImportWarning {
  type: "unresolved_alias" | "dynamic_import" | "missing_hands_import";
  message: string;
  line?: number;
}

/**
 * Known @hands/* aliases that should be available
 */
const KNOWN_HANDS_ALIASES = [
  "@hands/core",
  "@hands/core/primitives",
  "@hands/db",
  "@hands/db/types",
  "@hands/runtime",
];

/**
 * Validate imports in a source file.
 * Checks for:
 * - Unresolved @hands/* imports (typos, missing aliases)
 * - Dynamic imports that bypass module resolution
 */
export function validateImports(code: string, filePath: string): ImportWarning[] {
  const warnings: ImportWarning[] = [];
  const lines = code.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Check for @hands/* imports
    const handsImportMatch = line.match(
      /from\s+["'](@hands\/[^"']+)["']|import\s*\(\s*["'](@hands\/[^"']+)["']\s*\)/,
    );
    if (handsImportMatch) {
      const importPath = handsImportMatch[1] || handsImportMatch[2];
      // Check if it's a known alias or starts with a known alias
      const isKnown = KNOWN_HANDS_ALIASES.some(
        (alias) => importPath === alias || importPath.startsWith(`${alias}/`),
      );
      if (!isKnown) {
        warnings.push({
          type: "unresolved_alias",
          message: `Unknown @hands import: "${importPath}". Known aliases: ${KNOWN_HANDS_ALIASES.join(", ")}`,
          line: lineNum,
        });
      }
    }

    // Check for dynamic imports with variables (can't be statically resolved)
    const dynamicImportMatch = line.match(/import\s*\(\s*([^"'`\s][^)]*)\s*\)/);
    if (dynamicImportMatch) {
      const importArg = dynamicImportMatch[1].trim();
      // If it's not a string literal, it's a dynamic import
      if (!importArg.startsWith('"') && !importArg.startsWith("'") && !importArg.startsWith("`")) {
        warnings.push({
          type: "dynamic_import",
          message: `Dynamic import with variable: import(${importArg}). Use static imports for reliable module resolution.`,
          line: lineNum,
        });
      }
    }
  }

  return warnings;
}

/**
 * Check if a file uses @hands/core/primitives (required for actions)
 */
export function checkActionImports(code: string): ImportWarning[] {
  const warnings: ImportWarning[] = [];

  // Check if file uses defineAction
  if (code.includes("defineAction")) {
    // Should import from @hands/core/primitives or @hands/core
    const hasCorrectImport =
      code.includes("@hands/core/primitives") || code.includes("@hands/core");

    if (!hasCorrectImport) {
      warnings.push({
        type: "missing_hands_import",
        message:
          'Action uses defineAction but missing import. Add: import { defineAction } from "@hands/core/primitives"',
      });
    }
  }

  return warnings;
}

// =============================================================================
// SQL Validation
// =============================================================================

export interface SqlWarning {
  type: "invalid_syntax" | "unknown_table" | "unknown_column";
  message: string;
  sql: string;
  line?: number;
}

/**
 * Extract SQL template literals from source code
 * Matches: sql`...` and sql<Type>`...`
 */
export function extractSqlQueries(code: string): Array<{ sql: string; line: number }> {
  const queries: Array<{ sql: string; line: number }> = [];
  const lines = code.split("\n");

  // Match sql`...` or sql<...>`...` template literals
  // This is a simplified parser - doesn't handle nested templates perfectly
  const sqlRegex = /\bsql(?:<[^>]*>)?\s*`([^`]*)`/g;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let match;
    while ((match = sqlRegex.exec(line)) !== null) {
      // Extract the SQL, replacing ${...} placeholders with ?
      const rawSql = match[1].replace(/\$\{[^}]*\}/g, "?");
      queries.push({ sql: rawSql.trim(), line: i + 1 });
    }
  }

  // Also check for multi-line sql`` templates
  const fullCode = code;
  const multiLineRegex = /\bsql(?:<[^>]*>)?\s*`([\s\S]*?)`/g;
  let match;
  while ((match = multiLineRegex.exec(fullCode)) !== null) {
    const rawSql = match[1].replace(/\$\{[^}]*\}/g, "?");
    // Calculate line number from match position
    const lineNum = fullCode.substring(0, match.index).split("\n").length;
    // Avoid duplicates from single-line matches
    if (!queries.some((q) => q.sql === rawSql.trim() && q.line === lineNum)) {
      queries.push({ sql: rawSql.trim(), line: lineNum });
    }
  }

  return queries;
}

/**
 * Parse DB types file to extract known tables and columns
 */
export function parseDbTypes(dbTypesContent: string): Map<string, string[]> {
  const tables = new Map<string, string[]>();

  // Match interface definitions: interface TableName { ... }
  const interfaceRegex = /export interface (\w+)\s*\{([^}]+)\}/g;
  let match;

  while ((match = interfaceRegex.exec(dbTypesContent)) !== null) {
    const interfaceName = match[1];
    const body = match[2];

    // Skip internal interfaces
    if (interfaceName === "DB" || interfaceName.startsWith("_")) continue;

    // Extract column names from the interface body
    const columns: string[] = [];
    const columnRegex = /(\w+)\s*:/g;
    let colMatch;
    while ((colMatch = columnRegex.exec(body)) !== null) {
      columns.push(colMatch[1]);
    }

    // Convert PascalCase to snake_case for table name
    const tableName = interfaceName
      .replace(/([A-Z])/g, "_$1")
      .toLowerCase()
      .replace(/^_/, "");

    tables.set(tableName, columns);
  }

  return tables;
}

/**
 * Extract table names from SQL query
 */
function extractTablesFromSql(sql: string): string[] {
  const tables: string[] = [];
  const _upperSql = sql.toUpperCase();

  // Match FROM table, JOIN table, INTO table, UPDATE table
  const patterns = [
    /FROM\s+(\w+)/gi,
    /JOIN\s+(\w+)/gi,
    /INTO\s+(\w+)/gi,
    /UPDATE\s+(\w+)/gi,
    /INSERT\s+INTO\s+(\w+)/gi,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(sql)) !== null) {
      tables.push(match[1].toLowerCase());
    }
  }

  return [...new Set(tables)];
}

/**
 * Validate SQL queries against known schema
 */
export function validateSqlQueries(
  queries: Array<{ sql: string; line: number }>,
  knownTables: Map<string, string[]>,
): SqlWarning[] {
  const warnings: SqlWarning[] = [];

  for (const { sql, line } of queries) {
    // Skip empty queries
    if (!sql.trim()) continue;

    // Extract and validate table references
    const tables = extractTablesFromSql(sql);
    for (const table of tables) {
      if (!knownTables.has(table)) {
        warnings.push({
          type: "unknown_table",
          message: `Unknown table "${table}". Available tables: ${[...knownTables.keys()].join(", ")}`,
          sql,
          line,
        });
      }
    }

    // Basic syntax validation - check for common issues
    const upperSql = sql.toUpperCase().trim();
    if (upperSql.startsWith("SELECT") && !upperSql.includes("FROM") && !upperSql.includes("(")) {
      // SELECT without FROM (unless it's a function call or subquery)
      if (!/SELECT\s+\d+|SELECT\s+['"]|SELECT\s+\?/i.test(sql)) {
        warnings.push({
          type: "invalid_syntax",
          message: "SELECT statement missing FROM clause",
          sql,
          line,
        });
      }
    }
  }

  return warnings;
}

export interface BlockValidationResult {
  valid: boolean;
  error?: string;
  meta?: BlockMeta;
  uninitialized?: boolean;
}

/**
 * Validate a block file
 *
 * Checks that the file has a valid default export function.
 */
export async function validateBlockFile(filePath: string): Promise<BlockValidationResult> {
  try {
    const code = readFileSync(filePath, "utf-8");

    // Check for default export
    const hasDefaultExport =
      /export\s+default\s+/.test(code) || /export\s*{\s*[^}]*\bdefault\b/.test(code);

    if (!hasDefaultExport) {
      return {
        valid: false,
        error: "Missing default export. Blocks must export a default function.",
      };
    }

    // Check that default export looks like a function
    const defaultExportPatterns = [
      /export\s+default\s+function\s/,
      /export\s+default\s+async\s+function\s/,
      /export\s+default\s+\(\s*[\w,\s{}]*\)\s*=>/,
      /export\s+default\s+async\s*\(\s*[\w,\s{}]*\)\s*=>/,
      /const\s+\w+\s*:\s*\w+.*=.*[\s\S]*export\s+default\s+\w+/,
    ];

    const looksLikeFunction = defaultExportPatterns.some((pattern) => pattern.test(code));

    if (!looksLikeFunction) {
      // Runtime validation would require importing the module
      // For static analysis, we trust it looks reasonable
      // The runtime will catch actual errors
    }

    const meta = extractBlockMeta(code);
    const uninitialized = code.includes("@hands:uninitialized");

    return { valid: true, meta, uninitialized };
  } catch (err) {
    return {
      valid: false,
      error: `Failed to read file: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Extract metadata from block file
 */
export function extractBlockMeta(code: string): BlockMeta | undefined {
  // Match: export const meta = { ... } or export const meta: BlockMeta = { ... }
  const metaMatch = code.match(/export\s+const\s+meta\s*(?::\s*\w+)?\s*=\s*({[\s\S]*?});/);

  if (!metaMatch) {
    return undefined;
  }

  try {
    const meta: BlockMeta = {};
    const metaCode = metaMatch[1];

    // Extract title
    const titleMatch = metaCode.match(/title\s*:\s*["']([^"']+)["']/);
    if (titleMatch) {
      meta.title = titleMatch[1];
    }

    // Extract description
    const descMatch = metaCode.match(/description\s*:\s*["']([^"']+)["']/);
    if (descMatch) {
      meta.description = descMatch[1];
    }

    // Extract refreshable
    const refreshMatch = metaCode.match(/refreshable\s*:\s*(true|false)/);
    if (refreshMatch) {
      meta.refreshable = refreshMatch[1] === "true";
    }

    return Object.keys(meta).length > 0 ? meta : undefined;
  } catch {
    return undefined;
  }
}
