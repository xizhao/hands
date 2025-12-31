/**
 * Text-to-SQL Engine
 *
 * Converts natural language queries to SQL by fuzzy matching
 * against available tables and columns.
 *
 * Initial implementation uses best-effort parsing.
 * Future: Replace with fast model call + parsing fallback.
 */

export interface TableSchema {
  table_name: string;
  columns: Array<{
    name: string;
    type: string;
    nullable: boolean;
  }>;
}

export type ResultShape = "single" | "list" | "table" | "multi-dim";

export interface TextToSQLResult {
  /** Generated SQL query */
  sql: string;
  /** Tables referenced in the query */
  tables: string[];
  /** Columns selected */
  columns: string[];
  /** Confidence score 0-1 */
  confidence: number;
  /** Result shape determines available elements */
  shape: ResultShape;
  /** Preview description */
  preview: string;
}

export interface FuzzyMatch<T> {
  item: T;
  score: number;
}

/**
 * Simple fuzzy matching score (0-1)
 * Higher = better match
 */
function fuzzyScore(query: string, target: string): number {
  const q = query.toLowerCase();
  const t = target.toLowerCase();

  // Exact match
  if (q === t) return 1;

  // Starts with
  if (t.startsWith(q)) return 0.9;

  // Contains
  if (t.includes(q)) return 0.7;

  // Character-by-character fuzzy
  let score = 0;
  let qIdx = 0;
  for (let tIdx = 0; tIdx < t.length && qIdx < q.length; tIdx++) {
    if (t[tIdx] === q[qIdx]) {
      score += 1;
      qIdx++;
    }
  }
  if (qIdx === q.length) {
    return 0.5 * (score / t.length);
  }

  return 0;
}

/**
 * Find best matching tables for a query
 */
export function matchTables(query: string, schema: TableSchema[]): FuzzyMatch<TableSchema>[] {
  const words = query.toLowerCase().split(/\s+/);

  return schema
    .map((table) => {
      // Score against table name
      let bestScore = 0;
      for (const word of words) {
        const score = fuzzyScore(word, table.table_name);
        if (score > bestScore) bestScore = score;
      }
      return { item: table, score: bestScore };
    })
    .filter((m) => m.score > 0.3)
    .sort((a, b) => b.score - a.score);
}

/**
 * Find best matching columns for a query within tables
 */
export function matchColumns(
  query: string,
  tables: TableSchema[],
): FuzzyMatch<{ table: string; column: string; type: string }>[] {
  const words = query.toLowerCase().split(/\s+/);
  const matches: FuzzyMatch<{ table: string; column: string; type: string }>[] = [];

  for (const table of tables) {
    for (const col of table.columns) {
      let bestScore = 0;
      for (const word of words) {
        const score = fuzzyScore(word, col.name);
        if (score > bestScore) bestScore = score;
      }
      if (bestScore > 0.3) {
        matches.push({
          item: { table: table.table_name, column: col.name, type: col.type },
          score: bestScore,
        });
      }
    }
  }

  return matches.sort((a, b) => b.score - a.score);
}

/**
 * Detect aggregation keywords in query
 */
function detectAggregation(
  query: string,
): { type: "count" | "sum" | "avg" | "min" | "max"; keyword: string } | null {
  const lower = query.toLowerCase();

  const patterns: Array<{
    keywords: string[];
    type: "count" | "sum" | "avg" | "min" | "max";
  }> = [
    { keywords: ["how many", "count", "number of", "total"], type: "count" },
    { keywords: ["sum", "total of", "add up"], type: "sum" },
    { keywords: ["average", "avg", "mean"], type: "avg" },
    { keywords: ["minimum", "min", "lowest", "smallest"], type: "min" },
    { keywords: ["maximum", "max", "highest", "largest"], type: "max" },
  ];

  for (const pattern of patterns) {
    for (const keyword of pattern.keywords) {
      if (lower.includes(keyword)) {
        return { type: pattern.type, keyword };
      }
    }
  }

  return null;
}

/**
 * Detect grouping keywords
 */
function detectGrouping(query: string): string[] {
  const lower = query.toLowerCase();
  const groups: string[] = [];

  // "by X" pattern
  const byPattern = /\bby\s+(\w+)/g;
  let match;
  while ((match = byPattern.exec(lower)) !== null) {
    groups.push(match[1]);
  }

  // "per X" pattern
  const perPattern = /\bper\s+(\w+)/g;
  while ((match = perPattern.exec(lower)) !== null) {
    groups.push(match[1]);
  }

  // "for each X" pattern
  const forEachPattern = /\bfor each\s+(\w+)/g;
  while ((match = forEachPattern.exec(lower)) !== null) {
    groups.push(match[1]);
  }

  return groups;
}

/**
 * Infer result shape from query structure
 */
function inferShape(columns: string[], hasAggregation: boolean, groupBy: string[]): ResultShape {
  // Single aggregation without grouping = single value
  if (hasAggregation && groupBy.length === 0) {
    return "single";
  }

  // Aggregation with grouping = multi-dimensional
  if (hasAggregation && groupBy.length > 0) {
    return "multi-dim";
  }

  // Single column = list
  if (columns.length === 1) {
    return "list";
  }

  // Multiple columns = table
  return "table";
}

/**
 * Main text-to-SQL conversion
 */
export function textToSQL(query: string, schema: TableSchema[]): TextToSQLResult | null {
  if (!query.trim() || schema.length === 0) {
    return null;
  }

  // Find matching tables
  const tableMatches = matchTables(query, schema);
  if (tableMatches.length === 0) {
    return null;
  }

  const primaryTable = tableMatches[0].item;
  const matchedTables = tableMatches.slice(0, 2).map((m) => m.item);

  // Find matching columns
  const columnMatches = matchColumns(query, matchedTables);

  // Detect aggregation
  const aggregation = detectAggregation(query);

  // Detect grouping
  const groupKeywords = detectGrouping(query);
  const groupColumns = groupKeywords
    .map((kw) => {
      const match = columnMatches.find(
        (m) => m.item.column.toLowerCase().includes(kw) || kw.includes(m.item.column.toLowerCase()),
      );
      return match?.item.column;
    })
    .filter(Boolean) as string[];

  // Build SELECT clause
  let selectClause: string;
  let selectedColumns: string[] = [];

  if (aggregation) {
    if (groupColumns.length > 0) {
      // Aggregation with grouping
      const aggCol = columnMatches.find(
        (m) =>
          !groupColumns.includes(m.item.column) &&
          (m.item.type.includes("INT") ||
            m.item.type.includes("REAL") ||
            m.item.type.includes("NUMERIC")),
      );
      const aggTarget = aggCol ? aggCol.item.column : "*";
      selectClause = `${groupColumns.join(", ")}, ${aggregation.type.toUpperCase()}(${aggTarget})`;
      selectedColumns = [...groupColumns, `${aggregation.type}(${aggTarget})`];
    } else {
      // Simple aggregation
      selectClause = `${aggregation.type.toUpperCase()}(*)`;
      selectedColumns = [`${aggregation.type}(*)`];
    }
  } else if (columnMatches.length > 0) {
    // Specific columns
    selectedColumns = columnMatches.slice(0, 5).map((m) => m.item.column);
    selectClause = selectedColumns.join(", ");
  } else {
    // Default to all columns
    selectClause = "*";
    selectedColumns = primaryTable.columns.map((c) => c.name);
  }

  // Build FROM clause
  const fromClause = primaryTable.table_name;

  // Build GROUP BY clause
  const groupByClause = groupColumns.length > 0 ? `GROUP BY ${groupColumns.join(", ")}` : "";

  // Build full query
  const sql = `SELECT ${selectClause} FROM ${fromClause}${groupByClause ? ` ${groupByClause}` : ""}`;

  // Infer shape
  const shape = inferShape(selectedColumns, !!aggregation, groupColumns);

  // Calculate confidence
  const confidence = Math.min(
    1,
    tableMatches[0].score * 0.5 +
      (columnMatches.length > 0 ? columnMatches[0].score * 0.3 : 0.1) +
      (aggregation ? 0.2 : 0),
  );

  // Build preview
  let preview: string;
  switch (shape) {
    case "single":
      preview = `${aggregation?.type || "value"} from ${primaryTable.table_name}`;
      break;
    case "list":
      preview = `${selectedColumns[0]} values from ${primaryTable.table_name}`;
      break;
    case "table":
      preview = `${selectedColumns.length} columns from ${primaryTable.table_name}`;
      break;
    case "multi-dim":
      preview = `${aggregation?.type || "values"} by ${groupColumns.join(", ")}`;
      break;
  }

  return {
    sql,
    tables: matchedTables.map((t) => t.table_name),
    columns: selectedColumns,
    confidence,
    shape,
    preview,
  };
}

/**
 * Get autocomplete suggestions for partial query
 */
export function getAutocompleteSuggestions(
  query: string,
  schema: TableSchema[],
  limit = 5,
): Array<{ type: "table" | "column"; name: string; table?: string; score: number }> {
  const suggestions: Array<{
    type: "table" | "column";
    name: string;
    table?: string;
    score: number;
  }> = [];

  // Add matching tables
  const tableMatches = matchTables(query, schema);
  for (const match of tableMatches.slice(0, limit)) {
    suggestions.push({
      type: "table",
      name: match.item.table_name,
      score: match.score,
    });
  }

  // Add matching columns
  const columnMatches = matchColumns(query, schema);
  for (const match of columnMatches.slice(0, limit)) {
    suggestions.push({
      type: "column",
      name: match.item.column,
      table: match.item.table,
      score: match.score,
    });
  }

  // Sort by score and limit
  return suggestions.sort((a, b) => b.score - a.score).slice(0, limit);
}
