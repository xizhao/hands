/**
 * Lightweight SQL Table Extractor (browser-compatible)
 *
 * Uses regex to extract table names from SQL queries in block source code.
 * Designed to work in browser without heavy AST parsers.
 *
 * Matches patterns:
 * - ctx.db.sql`...` and ctx.sql`...` tagged template literals
 * - FROM table_name
 * - JOIN table_name
 * - INSERT INTO table_name
 * - UPDATE table_name
 * - DELETE FROM table_name
 */

/**
 * Extract table names from a SQL query string
 */
function extractTablesFromSql(sql: string): string[] {
  const tables: string[] = [];

  // Normalize SQL - collapse whitespace, case insensitive
  const normalized = sql.replace(/\s+/g, ' ').trim();

  // Patterns that precede table names
  const patterns = [
    /\bFROM\s+["']?(\w+)["']?/gi,
    /\bJOIN\s+["']?(\w+)["']?/gi,
    /\bINSERT\s+INTO\s+["']?(\w+)["']?/gi,
    /\bUPDATE\s+["']?(\w+)["']?/gi,
    /\bDELETE\s+FROM\s+["']?(\w+)["']?/gi,
    /\bINTO\s+["']?(\w+)["']?/gi,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(normalized)) !== null) {
      const tableName = match[1];
      // Filter out SQL keywords that might be mistakenly captured
      const keywords = new Set([
        'select', 'from', 'where', 'and', 'or', 'not', 'in', 'like',
        'values', 'set', 'as', 'on', 'using', 'null', 'true', 'false',
        'case', 'when', 'then', 'else', 'end', 'order', 'by', 'group',
        'having', 'limit', 'offset', 'inner', 'outer', 'left', 'right',
        'cross', 'full', 'natural', 'distinct', 'all', 'union', 'except',
        'intersect', 'exists', 'between', 'is', 'asc', 'desc'
      ]);
      if (!keywords.has(tableName.toLowerCase())) {
        tables.push(tableName);
      }
    }
  }

  // Return unique table names
  return [...new Set(tables)];
}

/**
 * Extract SQL template literals from source code
 * Matches ctx.db.sql`...` and ctx.sql`...` patterns
 */
function extractSqlLiterals(source: string): string[] {
  const sqls: string[] = [];

  // Match ctx.db.sql`...` or ctx.sql`...`
  // Using a simple approach that handles most cases
  const taggedTemplateRegex = /ctx(?:\.db)?\.sql\s*`([^`]*)`/g;

  let match;
  while ((match = taggedTemplateRegex.exec(source)) !== null) {
    const sql = match[1];
    // Replace template expressions ${...} with placeholder
    const cleanedSql = sql.replace(/\$\{[^}]*\}/g, '$1');
    sqls.push(cleanedSql);
  }

  return sqls;
}

/**
 * Extract all referenced table names from block source code
 *
 * @param source - Block source code (TSX/JSX)
 * @returns Array of unique table names found in SQL queries
 */
export function extractLinkedTables(source: string): string[] {
  const sqls = extractSqlLiterals(source);
  const allTables: string[] = [];

  for (const sql of sqls) {
    const tables = extractTablesFromSql(sql);
    allTables.push(...tables);
  }

  // Return unique, sorted table names
  return [...new Set(allTables)].sort();
}
