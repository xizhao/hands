/**
 * SQL validation utilities for ensuring read-only queries.
 *
 * This module provides fast, robust SQL statement classification without
 * hacky regex patterns. It uses a tokenizer approach to properly handle
 * comments, whitespace, and extract the first statement keyword.
 */

/**
 * Read-only SQL statement keywords that are safe for LiveValue.
 * These cannot modify data or schema.
 */
const READ_ONLY_KEYWORDS = new Set([
  "SELECT",
  "WITH", // CTE - always followed by SELECT
  "EXPLAIN",
  "SHOW",
  "DESCRIBE",
  "DESC",
  "VALUES", // Read-only row constructor
  "TABLE", // Shorthand for SELECT * FROM table
]);

/**
 * Keywords that indicate write/mutation operations.
 * Used for better error messages.
 */
const WRITE_KEYWORDS = new Set([
  "INSERT",
  "UPDATE",
  "DELETE",
  "TRUNCATE",
  "DROP",
  "CREATE",
  "ALTER",
  "GRANT",
  "REVOKE",
  "COPY", // Can write to files
  "CALL", // Stored procedures can mutate
  "DO", // Anonymous code blocks
  "EXECUTE", // Dynamic SQL
  "PREPARE", // Prepared statements
  "DEALLOCATE",
  "SET", // Session variables
  "LOCK",
  "UNLOCK",
  "BEGIN",
  "COMMIT",
  "ROLLBACK",
  "SAVEPOINT",
  "RELEASE",
  "VACUUM",
  "ANALYZE", // Can be mutating in some DBs
  "REINDEX",
  "CLUSTER",
  "REFRESH", // Materialized views
  "NOTIFY",
  "LISTEN",
  "UNLISTEN",
]);

export type SqlValidationResult =
  | { valid: true; keyword: string }
  | { valid: false; keyword: string | null; reason: string };

/**
 * Extract the first SQL keyword from a query string.
 * Properly handles:
 * - Leading whitespace
 * - Single-line comments (--)
 * - Multi-line comments (/* ... *\/)
 * - Case insensitivity
 *
 * Returns null if no valid keyword found (empty query, only comments, etc.)
 */
export function extractFirstKeyword(sql: string): string | null {
  const len = sql.length;
  let i = 0;

  // Skip whitespace and comments to find first keyword
  while (i < len) {
    const char = sql[i];

    // Skip whitespace
    if (char === " " || char === "\t" || char === "\n" || char === "\r") {
      i++;
      continue;
    }

    // Check for single-line comment: --
    if (char === "-" && i + 1 < len && sql[i + 1] === "-") {
      // Skip to end of line
      i += 2;
      while (i < len && sql[i] !== "\n") {
        i++;
      }
      continue;
    }

    // Check for multi-line comment: /* ... */
    if (char === "/" && i + 1 < len && sql[i + 1] === "*") {
      i += 2;
      // Find closing */
      while (i + 1 < len) {
        if (sql[i] === "*" && sql[i + 1] === "/") {
          i += 2;
          break;
        }
        i++;
      }
      // Handle unclosed comment - skip to end
      if (i + 1 >= len) {
        return null;
      }
      continue;
    }

    // Found start of keyword - extract it
    if (isKeywordChar(char)) {
      const start = i;
      while (i < len && isKeywordChar(sql[i])) {
        i++;
      }
      return sql.slice(start, i).toUpperCase();
    }

    // Unexpected character (not whitespace, comment, or letter)
    // Could be a malformed query starting with punctuation
    return null;
  }

  // Only whitespace/comments found
  return null;
}

/**
 * Check if character can be part of a SQL keyword.
 * Keywords are alphanumeric (including underscore for some DBs).
 */
function isKeywordChar(char: string): boolean {
  const code = char.charCodeAt(0);
  return (
    (code >= 65 && code <= 90) || // A-Z
    (code >= 97 && code <= 122) || // a-z
    (code >= 48 && code <= 57) || // 0-9
    code === 95 // _
  );
}

/**
 * Validate that a SQL query is read-only (safe for LiveValue).
 *
 * @param sql - The SQL query string to validate
 * @returns Validation result with keyword and reason if invalid
 *
 * @example
 * ```ts
 * const result = validateReadOnlySQL("SELECT * FROM users");
 * if (!result.valid) {
 *   throw new Error(result.reason);
 * }
 * ```
 */
export function validateReadOnlySQL(sql: string): SqlValidationResult {
  const keyword = extractFirstKeyword(sql);

  if (keyword === null) {
    return {
      valid: false,
      keyword: null,
      reason: "Could not parse SQL statement - query appears to be empty or malformed",
    };
  }

  if (READ_ONLY_KEYWORDS.has(keyword)) {
    return { valid: true, keyword };
  }

  if (WRITE_KEYWORDS.has(keyword)) {
    return {
      valid: false,
      keyword,
      reason: `SQL statement '${keyword}' is not allowed - LiveValue only supports read-only queries (SELECT, WITH, EXPLAIN, SHOW, DESCRIBE)`,
    };
  }

  // Unknown keyword - reject by default for safety
  return {
    valid: false,
    keyword,
    reason: `Unknown SQL statement '${keyword}' - LiveValue only supports read-only queries (SELECT, WITH, EXPLAIN, SHOW, DESCRIBE)`,
  };
}

/**
 * Assert that a SQL query is read-only, throwing if not.
 *
 * @param sql - The SQL query string to validate
 * @throws Error if the query is not read-only
 *
 * @example
 * ```ts
 * assertReadOnlySQL("SELECT * FROM users"); // OK
 * assertReadOnlySQL("DELETE FROM users"); // Throws!
 * ```
 */
export function assertReadOnlySQL(sql: string): void {
  const result = validateReadOnlySQL(sql);
  if (!result.valid) {
    throw new Error(result.reason);
  }
}
