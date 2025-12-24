/**
 * SQL Builder - Pure functions for SQL generation
 *
 * These functions generate SQL strings from structured data.
 * All functions are pure and have no side effects.
 * Designed for SQLite/PostgreSQL compatibility.
 */

export interface SelectOptions {
  table: string;
  columns?: string[];
  where?: string;
  orderBy?: string;
  orderDirection?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

/**
 * Escape a SQL identifier (table name, column name) using double quotes.
 * Handles internal double quotes by doubling them.
 */
export function escapeIdentifier(identifier: string): string {
  if (!identifier) {
    throw new Error("Identifier cannot be empty");
  }
  // Escape internal double quotes by doubling them
  const escaped = identifier.replace(/"/g, '""');
  return `"${escaped}"`;
}

/**
 * Escape a SQL value for safe insertion into a query.
 * Handles strings, numbers, booleans, null, and objects (as JSON).
 */
export function escapeValue(value: unknown): string {
  // NULL
  if (value === null || value === undefined) {
    return "NULL";
  }

  // Boolean
  if (typeof value === "boolean") {
    return value ? "TRUE" : "FALSE";
  }

  // Number
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Cannot escape non-finite number");
    }
    return String(value);
  }

  // BigInt
  if (typeof value === "bigint") {
    return String(value);
  }

  // Date
  if (value instanceof Date) {
    return `'${value.toISOString()}'`;
  }

  // Object/Array - serialize as JSON
  if (typeof value === "object") {
    const json = JSON.stringify(value);
    // Escape single quotes in the JSON string
    const escaped = json.replace(/'/g, "''");
    return `'${escaped}'`;
  }

  // String - escape single quotes by doubling them
  const str = String(value);
  const escaped = str.replace(/'/g, "''");
  return `'${escaped}'`;
}

/**
 * Generate an INSERT SQL statement.
 */
export function generateInsertSql(
  table: string,
  data: Record<string, unknown>
): string {
  const columns = Object.keys(data);

  if (columns.length === 0) {
    throw new Error("Cannot generate INSERT with no columns");
  }

  const columnList = columns.map(escapeIdentifier).join(", ");
  const valueList = columns.map((col) => escapeValue(data[col])).join(", ");

  return `INSERT INTO ${escapeIdentifier(table)} (${columnList}) VALUES (${valueList})`;
}

/**
 * Generate an UPDATE SQL statement.
 */
export function generateUpdateSql(
  table: string,
  primaryKey: string,
  id: string,
  data: Record<string, unknown>
): string {
  const columns = Object.keys(data);

  if (columns.length === 0) {
    throw new Error("Cannot generate UPDATE with no columns");
  }

  const setClause = columns
    .map((col) => `${escapeIdentifier(col)} = ${escapeValue(data[col])}`)
    .join(", ");

  return `UPDATE ${escapeIdentifier(table)} SET ${setClause} WHERE ${escapeIdentifier(primaryKey)} = ${escapeValue(id)}`;
}

/**
 * Generate a DELETE SQL statement for a single row.
 */
export function generateDeleteSql(
  table: string,
  primaryKey: string,
  id: string
): string {
  return `DELETE FROM ${escapeIdentifier(table)} WHERE ${escapeIdentifier(primaryKey)} = ${escapeValue(id)}`;
}

/**
 * Generate a DELETE SQL statement for multiple rows using IN clause.
 */
export function generateBulkDeleteSql(
  table: string,
  primaryKey: string,
  ids: string[]
): string {
  if (ids.length === 0) {
    throw new Error("Cannot generate bulk DELETE with no IDs");
  }

  const idList = ids.map(escapeValue).join(", ");

  return `DELETE FROM ${escapeIdentifier(table)} WHERE ${escapeIdentifier(primaryKey)} IN (${idList})`;
}

/**
 * Generate a SELECT SQL statement with optional clauses.
 */
export function generateSelectSql(options: SelectOptions): string {
  const { table, columns, where, orderBy, orderDirection, limit, offset } =
    options;

  // Column list or *
  const columnList = columns?.length
    ? columns.map(escapeIdentifier).join(", ")
    : "*";

  let sql = `SELECT ${columnList} FROM ${escapeIdentifier(table)}`;

  // WHERE clause (passed as-is, caller is responsible for safety)
  if (where) {
    sql += ` WHERE ${where}`;
  }

  // ORDER BY clause
  if (orderBy) {
    const direction = orderDirection === "desc" ? "DESC" : "ASC";
    sql += ` ORDER BY ${escapeIdentifier(orderBy)} ${direction}`;
  }

  // LIMIT clause
  if (limit !== undefined && limit >= 0) {
    sql += ` LIMIT ${Math.floor(limit)}`;
  }

  // OFFSET clause
  if (offset !== undefined && offset > 0) {
    sql += ` OFFSET ${Math.floor(offset)}`;
  }

  return sql;
}

/**
 * Generate a COUNT SQL statement.
 */
export function generateCountSql(table: string): string {
  return `SELECT COUNT(*) as count FROM ${escapeIdentifier(table)}`;
}

/**
 * Whitelist of valid SQL types to prevent injection.
 * Includes common SQLite, PostgreSQL, and MySQL types.
 */
const VALID_SQL_TYPE_PATTERNS = [
  // Exact matches (case-insensitive)
  /^TEXT$/i,
  /^INTEGER$/i,
  /^INT$/i,
  /^BIGINT$/i,
  /^SMALLINT$/i,
  /^TINYINT$/i,
  /^REAL$/i,
  /^FLOAT$/i,
  /^DOUBLE$/i,
  /^DOUBLE PRECISION$/i,
  /^BOOLEAN$/i,
  /^BOOL$/i,
  /^BLOB$/i,
  /^JSON$/i,
  /^JSONB$/i,
  /^UUID$/i,
  /^DATE$/i,
  /^TIME$/i,
  /^DATETIME$/i,
  /^TIMESTAMP$/i,
  /^TIMESTAMPTZ$/i,
  /^NUMERIC$/i,
  // Parameterized types
  /^VARCHAR\(\d+\)$/i,
  /^CHAR\(\d+\)$/i,
  /^DECIMAL\(\d+,\s*\d+\)$/i,
  /^NUMERIC\(\d+,\s*\d+\)$/i,
];

/**
 * Validate that a SQL type is safe (not SQL injection).
 */
export function isValidSqlType(type: string): boolean {
  const trimmed = type.trim();
  return VALID_SQL_TYPE_PATTERNS.some((pattern) => pattern.test(trimmed));
}

/**
 * Generate an ALTER TABLE statement for adding a column.
 */
export function generateAddColumnSql(
  table: string,
  columnName: string,
  columnType: string,
  options?: { nullable?: boolean; defaultValue?: unknown }
): string {
  if (!isValidSqlType(columnType)) {
    throw new Error(`Invalid SQL type: ${columnType}`);
  }

  let sql = `ALTER TABLE ${escapeIdentifier(table)} ADD COLUMN ${escapeIdentifier(columnName)} ${columnType}`;

  if (options?.nullable === false) {
    sql += " NOT NULL";
  }

  if (options?.defaultValue !== undefined) {
    sql += ` DEFAULT ${escapeValue(options.defaultValue)}`;
  }

  return sql;
}

/**
 * Generate an ALTER TABLE statement for dropping a column.
 */
export function generateDropColumnSql(
  table: string,
  columnName: string
): string {
  return `ALTER TABLE ${escapeIdentifier(table)} DROP COLUMN ${escapeIdentifier(columnName)}`;
}

/**
 * Generate an ALTER TABLE statement for renaming a column.
 */
export function generateRenameColumnSql(
  table: string,
  oldName: string,
  newName: string
): string {
  return `ALTER TABLE ${escapeIdentifier(table)} RENAME COLUMN ${escapeIdentifier(oldName)} TO ${escapeIdentifier(newName)}`;
}

/**
 * Generate an ALTER TABLE statement for changing column type.
 * Note: This uses PostgreSQL syntax. SQLite requires table recreation.
 */
export function generateAlterColumnTypeSql(
  table: string,
  columnName: string,
  newType: string
): string {
  if (!isValidSqlType(newType)) {
    throw new Error(`Invalid SQL type: ${newType}`);
  }
  return `ALTER TABLE ${escapeIdentifier(table)} ALTER COLUMN ${escapeIdentifier(columnName)} TYPE ${newType}`;
}
