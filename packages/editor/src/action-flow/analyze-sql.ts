/**
 * SQL Flow Analysis
 *
 * Analyzes SQL queries to extract:
 * - Tables referenced (reads and writes)
 * - CTEs (WITH clause)
 * - Columns accessed
 * - JOINs and subqueries
 */

import { Parser } from "node-sql-parser";
import type {
  SqlOperation,
  TableReference,
  CteDefinition,
  ColumnReference,
} from "./types";

const sqlParser = new Parser();

export interface SqlAnalysis {
  operation: SqlOperation;
  tables: TableReference[];
  ctes: CteDefinition[];
  columns: ColumnReference[];
}

/**
 * Analyze a SQL query string
 */
export function analyzeSql(sql: string): SqlAnalysis {
  const tables: TableReference[] = [];
  const ctes: CteDefinition[] = [];
  const columns: ColumnReference[] = [];
  let operation: SqlOperation = "unknown";

  // Skip if doesn't look like SQL
  if (!looksLikeSql(sql)) {
    return { operation, tables, ctes, columns };
  }

  try {
    const ast = sqlParser.astify(sql, { database: "PostgreSQL" });
    const statements = Array.isArray(ast) ? ast : [ast];

    for (const stmt of statements) {
      if (!stmt) continue;
      analyzeStatement(stmt, tables, ctes, columns);
      operation = detectOperation(stmt, sql);
    }
  } catch {
    // Fallback to regex for partial SQL
    const result = analyzeWithRegex(sql);
    return result;
  }

  return { operation, tables, ctes, columns };
}

/**
 * Check if string looks like SQL
 */
function looksLikeSql(text: string): boolean {
  return /\b(SELECT|INSERT|UPDATE|DELETE|WITH|FROM|INTO|SET|WHERE|VALUES)\b/i.test(text);
}

/**
 * Detect the primary operation type
 */
function detectOperation(stmt: unknown, originalSql?: string): SqlOperation {
  if (!stmt || typeof stmt !== "object") return "unknown";

  const s = stmt as Record<string, unknown>;
  const type = s.type as string | undefined;

  if (type === "select") return "select";
  if (type === "insert" || type === "replace") {
    // Check for ON CONFLICT (upsert) - check AST and raw SQL
    if (s.on_duplicate_update || s.on_conflict) return "upsert";
    // Fallback: check raw SQL for ON CONFLICT pattern
    if (originalSql && /ON\s+CONFLICT/i.test(originalSql)) return "upsert";
    return "insert";
  }
  if (type === "update") return "update";
  if (type === "delete") return "delete";

  return "unknown";
}

/**
 * Analyze a parsed SQL statement
 */
function analyzeStatement(
  stmt: unknown,
  tables: TableReference[],
  ctes: CteDefinition[],
  columns: ColumnReference[]
): void {
  if (!stmt || typeof stmt !== "object") return;

  const s = stmt as Record<string, unknown>;

  // Extract CTEs (WITH clause)
  if (s.with) {
    const withClauses = s.with as Array<{ name?: { value?: string }; stmt?: unknown }>;
    for (const cte of withClauses) {
      if (cte.name?.value) {
        const cteDef: CteDefinition = {
          name: cte.name.value,
          readsFrom: [],
        };

        // Analyze the CTE's subquery to find what it reads
        if (cte.stmt) {
          const cteTables: TableReference[] = [];
          analyzeStatement(cte.stmt, cteTables, [], []);
          cteDef.readsFrom = cteTables.filter((t) => t.usage === "read").map((t) => t.table);
        }

        ctes.push(cteDef);
      }
    }
  }

  const type = s.type as string | undefined;

  // SELECT - reads from tables
  if (type === "select") {
    extractFromClause(s.from, tables, "read");
    extractColumns(s.columns, columns, "read");

    // Handle JOINs in FROM clause
    if (s.from && Array.isArray(s.from)) {
      for (const fromItem of s.from) {
        if (fromItem.join) {
          extractFromClause([fromItem], tables, "read");
        }
      }
    }

    // Handle subqueries in WHERE
    if (s.where) {
      extractSubqueries(s.where, tables, ctes, columns);
    }
  }

  // INSERT
  if (type === "insert" || type === "replace") {
    extractTableList(s.table, tables, "write");

    // Extract columns being inserted
    if (s.columns) {
      const cols = s.columns as Array<string | { column?: string }>;
      for (const col of cols) {
        const colName = typeof col === "string" ? col : col.column;
        if (colName) {
          columns.push({ name: colName, usage: "write" });
        }
      }
    }

    // Check for SELECT in INSERT (INSERT INTO ... SELECT)
    if (s.values && typeof s.values === "object" && (s.values as Record<string, unknown>).type === "select") {
      analyzeStatement(s.values, tables, ctes, columns);
    }
  }

  // UPDATE
  if (type === "update") {
    extractTableList(s.table, tables, "write");

    // Extract SET columns
    if (s.set) {
      const setClauses = s.set as Array<{ column?: string }>;
      for (const clause of setClauses) {
        if (clause.column) {
          columns.push({ name: clause.column, usage: "write" });
        }
      }
    }

    // FROM clause in UPDATE (for JOINs)
    if (s.from) {
      extractFromClause(s.from, tables, "read");
    }
  }

  // DELETE
  if (type === "delete") {
    extractFromClause(s.from, tables, "write");

    // USING clause
    if (s.using) {
      extractFromClause(s.using, tables, "read");
    }
  }
}

/**
 * Extract tables from FROM clause
 */
function extractFromClause(
  from: unknown,
  tables: TableReference[],
  usage: "read" | "write"
): void {
  if (!from || !Array.isArray(from)) return;

  for (const item of from) {
    if (!item || typeof item !== "object") continue;

    const f = item as Record<string, unknown>;

    // Direct table reference
    if (f.table && typeof f.table === "string") {
      addTable(tables, f.table, f.as as string | undefined, usage, f.db as string | undefined);
    }

    // Subquery
    if (f.expr && typeof f.expr === "object") {
      const subquery = f.expr as Record<string, unknown>;
      if (subquery.type === "select") {
        const subTables: TableReference[] = [];
        analyzeStatement(subquery, subTables, [], []);
        tables.push(...subTables);
      }
    }

    // JOIN
    if (f.join) {
      extractFromClause([f], tables, usage);
    }
  }
}

/**
 * Extract tables from table list (for INSERT/UPDATE)
 */
function extractTableList(
  tableList: unknown,
  tables: TableReference[],
  usage: "read" | "write"
): void {
  if (!tableList) return;

  if (Array.isArray(tableList)) {
    for (const t of tableList) {
      if (t && typeof t === "object") {
        const table = t as Record<string, unknown>;
        if (table.table && typeof table.table === "string") {
          addTable(tables, table.table, table.as as string | undefined, usage, table.db as string | undefined);
        }
      }
    }
  } else if (typeof tableList === "object") {
    const table = tableList as Record<string, unknown>;
    if (table.table && typeof table.table === "string") {
      addTable(tables, table.table, table.as as string | undefined, usage, table.db as string | undefined);
    }
  }
}

/**
 * Add a table to the list (deduplicating)
 */
function addTable(
  tables: TableReference[],
  name: string,
  alias: string | undefined,
  usage: "read" | "write",
  schema?: string
): void {
  const tableName = name.toLowerCase();

  // Skip reserved words
  if (isReservedWord(tableName)) return;

  const existing = tables.find((t) => t.table === tableName);
  if (existing) {
    if (existing.usage !== usage) {
      existing.usage = "both";
    }
  } else {
    tables.push({
      table: tableName,
      alias: alias?.toLowerCase(),
      usage,
      schema: schema?.toLowerCase(),
    });
  }
}

/**
 * Extract columns from SELECT clause
 */
function extractColumns(
  columnsClause: unknown,
  columns: ColumnReference[],
  usage: "read" | "write"
): void {
  if (!columnsClause || !Array.isArray(columnsClause)) return;

  for (const col of columnsClause) {
    if (!col || typeof col !== "object") continue;

    const c = col as Record<string, unknown>;

    // Simple column reference
    if (c.expr && typeof c.expr === "object") {
      const expr = c.expr as Record<string, unknown>;
      if (expr.type === "column_ref") {
        const colName = expr.column as string;
        const tableName = expr.table as string | undefined;
        if (colName && colName !== "*") {
          columns.push({ name: colName, table: tableName?.toLowerCase(), usage });
        }
      }
    }
  }
}

/**
 * Extract subqueries from WHERE/expressions (recursive)
 */
function extractSubqueries(
  expr: unknown,
  tables: TableReference[],
  ctes: CteDefinition[],
  columns: ColumnReference[]
): void {
  if (!expr || typeof expr !== "object") return;

  // Handle arrays
  if (Array.isArray(expr)) {
    for (const item of expr) {
      extractSubqueries(item, tables, ctes, columns);
    }
    return;
  }

  const e = expr as Record<string, unknown>;

  // Check if this is a subquery (SELECT statement)
  if (e.type === "select") {
    analyzeStatement(e, tables, ctes, columns);
    return;
  }

  // Check ast property (some parsers put subqueries here)
  if (e.ast && typeof e.ast === "object") {
    extractSubqueries(e.ast, tables, ctes, columns);
  }

  // Recursively check all object properties
  for (const key of Object.keys(e)) {
    const val = e[key];
    if (val && typeof val === "object") {
      extractSubqueries(val, tables, ctes, columns);
    }
  }
}

/**
 * Fallback regex-based analysis
 */
function analyzeWithRegex(sql: string): SqlAnalysis {
  const tables: TableReference[] = [];
  const columns: ColumnReference[] = [];
  const ctes: CteDefinition[] = [];
  let operation: SqlOperation = "unknown";

  // Detect operation
  if (/^\s*SELECT/i.test(sql)) operation = "select";
  else if (/^\s*INSERT/i.test(sql)) {
    operation = /ON\s+CONFLICT/i.test(sql) ? "upsert" : "insert";
  } else if (/^\s*UPDATE/i.test(sql)) operation = "update";
  else if (/^\s*DELETE/i.test(sql)) operation = "delete";
  else if (/^\s*WITH/i.test(sql)) operation = "select"; // CTE usually leads to SELECT

  // Extract CTEs
  const cteMatches = sql.matchAll(/WITH\s+(\w+)\s+AS\s*\(/gi);
  for (const match of cteMatches) {
    ctes.push({ name: match[1].toLowerCase(), readsFrom: [] });
  }

  // Extract tables from FROM
  const fromMatches = sql.matchAll(/FROM\s+["'`]?(\w+)["'`]?/gi);
  for (const match of fromMatches) {
    addTable(tables, match[1], undefined, operation === "delete" ? "write" : "read");
  }

  // Extract tables from JOIN
  const joinMatches = sql.matchAll(/JOIN\s+["'`]?(\w+)["'`]?/gi);
  for (const match of joinMatches) {
    addTable(tables, match[1], undefined, "read");
  }

  // Extract INSERT INTO
  const insertMatches = sql.matchAll(/INSERT\s+INTO\s+["'`]?(\w+)["'`]?/gi);
  for (const match of insertMatches) {
    addTable(tables, match[1], undefined, "write");
  }

  // Extract UPDATE
  const updateMatches = sql.matchAll(/UPDATE\s+["'`]?(\w+)["'`]?\s+SET/gi);
  for (const match of updateMatches) {
    addTable(tables, match[1], undefined, "write");
  }

  return { operation, tables, ctes, columns };
}

/**
 * Check if word is a SQL reserved word
 */
function isReservedWord(word: string): boolean {
  const reserved = new Set([
    "select", "from", "where", "and", "or", "not", "in", "like", "between",
    "is", "null", "true", "false", "as", "on", "join", "left", "right",
    "inner", "outer", "cross", "group", "by", "having", "order", "asc",
    "desc", "limit", "offset", "union", "all", "distinct", "case", "when",
    "then", "else", "end", "values", "set", "default", "insert", "update",
    "delete", "into", "create", "table", "drop", "alter", "index", "primary",
    "key", "foreign", "references", "constraint", "unique", "check", "exists",
    "with", "recursive", "returning", "conflict", "do", "nothing",
  ]);
  return reserved.has(word.toLowerCase());
}
