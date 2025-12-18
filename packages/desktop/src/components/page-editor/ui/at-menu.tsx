/**
 * At Menu - Data query menu for inserting data-bound elements
 *
 * Type "@" to trigger, enter natural language query,
 * get SQL + appropriate data visualization elements.
 *
 * Flow:
 * 1. Type natural language query
 * 2. Text-to-SQL parses and shows result shape
 * 3. Select element type based on shape
 * 4. Insert data block into editor
 */

import {
  ChartBar,
  Database,
  ListBullets,
  MagnifyingGlass,
  NumberCircleOne,
  Table,
  TextT,
} from "@phosphor-icons/react";
import type { PlateEditor, PlateElementProps } from "platejs/react";
import { PlateElement } from "platejs/react";
import { useMemo } from "react";
import { useRuntimeState, type TableSchema } from "@/hooks/useRuntimeState";
import { SANDBOXED_BLOCK_KEY, type TSandboxedBlockElement } from "../SandboxedBlock";
import {
  textToSQL,
  getAutocompleteSuggestions,
  type TextToSQLResult,
  type ResultShape,
} from "../lib/text-to-sql";
import {
  LIVE_QUERY_KEY,
  type TLiveQueryElement,
  TEMPLATES,
  type ColumnConfig,
} from "../plugins/live-query-kit";
import {
  InlineCombobox,
  InlineComboboxContent,
  InlineComboboxEmpty,
  InlineComboboxGroup,
  InlineComboboxInput,
  InlineComboboxItem,
  useInlineComboboxSearchValue,
} from "./inline-combobox";

// ============================================================================
// Types
// ============================================================================

interface ElementOption {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  /** Template for creating the block */
  template: string;
}

// ============================================================================
// Element Options by Shape
// ============================================================================

const ELEMENT_OPTIONS: Record<ResultShape, ElementOption[]> = {
  single: [
    {
      id: "metric",
      label: "Metric",
      description: "Large single value display",
      icon: <NumberCircleOne weight="fill" className="size-4" />,
      template: "metric",
    },
    {
      id: "stat-card",
      label: "Stat Card",
      description: "Value with label and trend",
      icon: <TextT weight="fill" className="size-4" />,
      template: "stat-card",
    },
  ],
  list: [
    {
      id: "bullet-list",
      label: "Bullet List",
      description: "Simple bulleted list",
      icon: <ListBullets weight="fill" className="size-4" />,
      template: "bullet-list",
    },
    {
      id: "numbered-list",
      label: "Numbered List",
      description: "Ordered numbered list",
      icon: <ListBullets weight="fill" className="size-4" />,
      template: "numbered-list",
    },
  ],
  table: [
    {
      id: "data-table",
      label: "Data Table",
      description: "Full-featured sortable table",
      icon: <Table weight="fill" className="size-4" />,
      template: "data-table",
    },
    {
      id: "simple-table",
      label: "Simple Table",
      description: "Basic table view",
      icon: <Table className="size-4" />,
      template: "simple-table",
    },
  ],
  "multi-dim": [
    {
      id: "bar-chart",
      label: "Bar Chart",
      description: "Grouped bar visualization",
      icon: <ChartBar weight="fill" className="size-4" />,
      template: "bar-chart",
    },
    {
      id: "pivot-table",
      label: "Pivot Table",
      description: "Cross-tabulated data",
      icon: <Table weight="fill" className="size-4" />,
      template: "pivot-table",
    },
  ],
};

// ============================================================================
// Insert Functions
// ============================================================================

/**
 * Get the recommended element type for a result shape
 */
function getRecommendedElement(shape: ResultShape): ElementOption {
  const options = ELEMENT_OPTIONS[shape];
  return options[0]; // First option is always recommended
}

/**
 * Get template children for element type
 */
function getTemplateChildren(elementType: string): TLiveQueryElement["children"] | undefined {
  switch (elementType) {
    case "metric":
      return TEMPLATES.metric;
    case "stat-card":
      return TEMPLATES["stat-card"];
    case "bullet-list":
      return TEMPLATES["bullet-list"];
    case "numbered-list":
      return TEMPLATES["numbered-list"];
    default:
      return undefined; // Will use table mode
  }
}

/**
 * Check if element type should use table mode
 */
function isTableType(elementType: string): boolean {
  return ["data-table", "simple-table", "pivot-table"].includes(elementType);
}

/**
 * Insert a LiveQuery block with SQL query
 */
function insertDataBlock(
  editor: PlateEditor,
  sql: string,
  elementType: string,
  _preview: string
) {
  const templateChildren = getTemplateChildren(elementType);
  const useTable = isTableType(elementType);

  const node: TLiveQueryElement = {
    type: LIVE_QUERY_KEY,
    query: sql,
    // Use columns for table types
    ...(useTable ? { columns: "auto" as const } : {}),
    // Children are the template content (or empty for table mode)
    children: templateChildren ?? [{ text: "" }],
  };

  editor.tf.insertNodes(node);
}

/**
 * Insert using the recommended element for the result shape
 */
function insertRecommendedBlock(editor: PlateEditor, result: TextToSQLResult) {
  const recommended = getRecommendedElement(result.shape);
  insertDataBlock(editor, result.sql, recommended.template, result.preview);
}

/**
 * Insert a "Find Data" block that dispatches Hands agent to find/add data sources
 */
function insertFindDataBlock(editor: PlateEditor, query: string) {
  const prompt = `Find data source for: "${query}"

The user is looking for data that matches this query but it doesn't exist in the database yet.

Please help them:
1. Search for relevant public APIs, datasets, or data sources that could provide this data
2. Suggest how to import or connect this data to the workbook
3. If possible, create a source that fetches and imports this data

Focus on finding real, accessible data sources that match their needs.`;

  const node: TSandboxedBlockElement = {
    type: SANDBOXED_BLOCK_KEY,
    editing: true,
    prompt,
    children: [{ text: "" }],
  };
  editor.tf.insertNodes(node);
}

/**
 * Ordinal keywords for single row queries
 */
const ORDINAL_PATTERNS: Array<{ keywords: string[]; order: "ASC" | "DESC"; offset?: number }> = [
  { keywords: ["first", "1st", "earliest", "oldest"], order: "ASC" },
  { keywords: ["last", "latest", "newest", "most recent"], order: "DESC" },
  { keywords: ["second", "2nd"], order: "ASC", offset: 1 },
  { keywords: ["third", "3rd"], order: "ASC", offset: 2 },
];

/**
 * Detect ordinal keywords in query
 */
function detectOrdinal(query: string): { order: "ASC" | "DESC"; offset: number } | null {
  const lower = query.toLowerCase();
  for (const pattern of ORDINAL_PATTERNS) {
    for (const keyword of pattern.keywords) {
      if (lower.includes(keyword)) {
        return { order: pattern.order, offset: pattern.offset ?? 0 };
      }
    }
  }
  return null;
}

/**
 * Get matching columns across all tables
 */
function getMatchingColumns(
  query: string,
  schema: TableSchema[]
): Array<{
  table: TableSchema;
  column: { name: string; type: string };
  score: number;
}> {
  if (!query.trim() || schema.length === 0) return [];

  const words = query.toLowerCase().split(/\s+/);
  const results: Array<{
    table: TableSchema;
    column: { name: string; type: string };
    score: number;
  }> = [];

  for (const table of schema) {
    for (const col of table.columns) {
      let score = 0;
      for (const word of words) {
        // Skip ordinal keywords for column matching
        const isOrdinal = ORDINAL_PATTERNS.some(p => p.keywords.includes(word));
        if (isOrdinal) continue;

        if (col.name.toLowerCase().includes(word)) {
          score += 2;
        }
        // Boost if table name also matches
        if (table.table_name.toLowerCase().includes(word)) {
          score += 1;
        }
      }
      if (score > 0) {
        results.push({ table, column: col, score });
      }
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, 5);
}

/**
 * Get matching tables with their columns for the data preview
 */
function getMatchingTables(
  query: string,
  schema: TableSchema[]
): Array<{
  table: TableSchema;
  matchingColumns: string[];
  score: number;
}> {
  if (!query.trim() || schema.length === 0) return [];

  const words = query.toLowerCase().split(/\s+/);
  const results: Array<{
    table: TableSchema;
    matchingColumns: string[];
    score: number;
  }> = [];

  for (const table of schema) {
    let score = 0;
    const matchingColumns: string[] = [];

    // Check table name match
    for (const word of words) {
      // Skip ordinal keywords for table matching
      const isOrdinal = ORDINAL_PATTERNS.some(p => p.keywords.includes(word));
      if (isOrdinal) continue;

      if (table.table_name.toLowerCase().includes(word)) {
        score += 2;
      }
    }

    // Check column matches
    for (const col of table.columns) {
      for (const word of words) {
        const isOrdinal = ORDINAL_PATTERNS.some(p => p.keywords.includes(word));
        if (isOrdinal) continue;

        if (col.name.toLowerCase().includes(word)) {
          score += 1;
          if (!matchingColumns.includes(col.name)) {
            matchingColumns.push(col.name);
          }
        }
      }
    }

    if (score > 0) {
      results.push({ table, matchingColumns, score });
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, 3);
}

// ============================================================================
// Menu Content Component
// ============================================================================

/**
 * Shape icon component
 */
function ShapeIcon({ shape }: { shape: ResultShape }) {
  switch (shape) {
    case "single":
      return <NumberCircleOne weight="fill" className="size-4 text-brand" />;
    case "list":
      return <ListBullets weight="fill" className="size-4 text-brand" />;
    case "table":
      return <Table weight="fill" className="size-4 text-brand" />;
    case "multi-dim":
      return <ChartBar weight="fill" className="size-4 text-brand" />;
  }
}

/**
 * Main menu content - shows data preview, SQL options, and Find Data
 *
 * Flow:
 * 1. Type query → shows matching tables from "My Data" with columns
 * 2. If SQL parseable → shows Quick Insert with recommended element
 * 3. Arrow down → "Find Data with Hands" to search for new data sources
 *
 * Fast keyboard:
 * - Enter on SQL result → inserts recommended element
 * - Enter on table → queries all from that table
 * - Enter on Find Data → dispatches Hands agent to find data
 */
function AtMenuContent({ editor }: { editor: PlateEditor }) {
  const { schema, manifest } = useRuntimeState();
  const searchValue = useInlineComboboxSearchValue();

  // Use schema if available, otherwise fall back to manifest.tables
  // Manifest has different structure: { name, columns: string[] }
  // Schema has: { table_name, columns: { name, type, nullable }[] }
  const tables: TableSchema[] = useMemo(() => {
    if (schema.length > 0) return schema;

    // Fall back to manifest tables if schema not ready
    if (manifest?.tables?.length) {
      return manifest.tables.map(t => ({
        table_name: t.name,
        columns: t.columns.map(col => ({ name: col, type: "TEXT", nullable: true })),
      }));
    }
    return [];
  }, [schema, manifest?.tables]);

  const hasSearchValue = searchValue && searchValue.trim().length > 0;

  // Debug
  console.log("[AtMenu] schema:", schema.length, "manifest.tables:", manifest?.tables?.length, "tables:", tables.length);
  console.log("[AtMenu] searchValue:", JSON.stringify(searchValue));

  // Parse current query to SQL
  const sqlResult = useMemo(() => {
    if (!hasSearchValue || !tables.length) return null;
    return textToSQL(searchValue, tables);
  }, [searchValue, hasSearchValue, tables]);

  // Get matching tables with columns for data preview
  // When searching: filter to matching tables
  // When not searching: show all tables
  const matchingTables = useMemo(() => {
    if (!hasSearchValue) {
      // No search - return all tables with empty matchingColumns
      return tables.map(table => ({
        table,
        matchingColumns: [] as string[],
        score: 1,
      }));
    }
    return getMatchingTables(searchValue, tables);
  }, [searchValue, hasSearchValue, tables]);

  // Get matching individual columns (for single column / list queries)
  const matchingColumns = useMemo(() => {
    if (!hasSearchValue) return [];
    return getMatchingColumns(searchValue, tables);
  }, [searchValue, hasSearchValue, tables]);

  // Detect ordinal for single row queries (first, last, etc.)
  const ordinal = useMemo(() => {
    if (!hasSearchValue) return null;
    return detectOrdinal(searchValue);
  }, [searchValue, hasSearchValue]);

  console.log("[AtMenu] matchingTables:", matchingTables.length, "matchingColumns:", matchingColumns.length, "ordinal:", ordinal);

  // Get element options based on shape
  const elementOptions = useMemo(() => {
    if (!sqlResult) return [];
    return ELEMENT_OPTIONS[sqlResult.shape] || ELEMENT_OPTIONS.table;
  }, [sqlResult]);

  // Check if we have any data to show
  const hasData = tables.length > 0;
  const hasMatches = sqlResult || matchingTables.length > 0 || matchingColumns.length > 0;

  return (
    <>
      {/* SQL Quick Insert - when we have a parseable query (first for fast Enter) */}
      {sqlResult && (
        <>
          <div className="mt-1.5 mb-2 px-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">
            Quick Insert
          </div>
          <InlineComboboxItem
            alwaysShow
            keywords={["sql", "query", "data", sqlResult.shape]}
            label={sqlResult.preview}
            onClick={() => insertRecommendedBlock(editor, sqlResult)}
            value="sql-quick-insert"
          >
            <div className="flex size-8 shrink-0 items-center justify-center rounded border border-brand/30 bg-brand/10">
              <ShapeIcon shape={sqlResult.shape} />
            </div>
            <div className="ml-2 flex flex-1 flex-col truncate">
              <span className="text-foreground text-sm">
                {getRecommendedElement(sqlResult.shape).label}
              </span>
              <span className="truncate text-muted-foreground text-xs font-mono">
                {sqlResult.sql}
              </span>
            </div>
            <div className="ml-2 flex items-center gap-1">
              <span className="rounded bg-brand/10 text-brand px-1.5 py-0.5 text-xs font-medium">
                Enter
              </span>
            </div>
          </InlineComboboxItem>

          {/* Other element options */}
          {elementOptions.length > 1 && (
            <>
              <div className="mt-2.5 mb-2 px-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                Other Elements
              </div>
              {elementOptions.slice(1).map((option) => (
                <InlineComboboxItem
                  key={option.id}
                  keywords={[option.id, option.label, sqlResult.shape]}
                  label={option.label}
                  onClick={() => {
                    insertDataBlock(editor, sqlResult.sql, option.template, sqlResult.preview);
                  }}
                  value={`element-${option.id}`}
                >
                  <div className="flex size-8 shrink-0 items-center justify-center rounded border border-border bg-background">
                    {option.icon}
                  </div>
                  <div className="ml-2 flex flex-1 flex-col truncate">
                    <span className="text-foreground text-sm">{option.label}</span>
                    <span className="truncate text-muted-foreground text-xs">
                      {option.description}
                    </span>
                  </div>
                </InlineComboboxItem>
              ))}
            </>
          )}
        </>
      )}

      {/* My Data - matching tables with columns */}
      {matchingTables.length > 0 && (
        <>
          <div className="mt-1.5 mb-2 px-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">
            My Data
          </div>
          {matchingTables.slice(0, 5).map(({ table, matchingColumns }) => (
            <InlineComboboxItem
              alwaysShow
              key={table.table_name}
              keywords={[table.table_name, ...table.columns.map((c) => c.name)]}
              label={table.table_name}
              onClick={() => {
                // Insert a table query for all columns
                const sql = `SELECT * FROM ${table.table_name}`;
                insertDataBlock(editor, sql, "data-table", `All data from ${table.table_name}`);
              }}
              value={`table-${table.table_name}`}
            >
              <div className="flex size-8 shrink-0 items-center justify-center rounded border border-border bg-background">
                <Database className="size-4 text-muted-foreground" />
              </div>
              <div className="ml-2 flex flex-1 flex-col truncate">
                <span className="text-foreground text-sm font-medium">
                  {table.table_name}
                </span>
                <span className="truncate text-muted-foreground text-xs">
                  {matchingColumns.length > 0 ? (
                    // Show matching columns highlighted
                    <>
                      <span className="text-foreground/70">{matchingColumns.join(", ")}</span>
                      {table.columns.length > matchingColumns.length && (
                        <span> +{table.columns.length - matchingColumns.length} more</span>
                      )}
                    </>
                  ) : (
                    // Show first few columns when no specific match
                    <>
                      {table.columns.slice(0, 3).map((c) => c.name).join(", ")}
                      {table.columns.length > 3 && ` +${table.columns.length - 3} more`}
                    </>
                  )}
                </span>
              </div>
            </InlineComboboxItem>
          ))}
          {matchingTables.length > 5 && (
            <div className="px-3 py-1 text-xs text-muted-foreground">
              +{matchingTables.length - 5} more tables...
            </div>
          )}
        </>
      )}

      {/* Matching Columns - for single column / list queries */}
      {matchingColumns.length > 0 && (
        <>
          <div className="mt-1.5 mb-2 px-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">
            {ordinal ? "Single Value" : "Columns"}
          </div>
          {matchingColumns.slice(0, 4).map(({ table, column }) => {
            // Build SQL based on whether ordinal is detected
            // Alias column to match template expectations:
            // - metric template expects {{value}}
            // - list templates expect {{name}}
            const orderClause = ordinal
              ? ` ORDER BY rowid ${ordinal.order} LIMIT 1${ordinal.offset > 0 ? ` OFFSET ${ordinal.offset}` : ""}`
              : "";
            const alias = ordinal ? "value" : "name";
            const sql = `SELECT ${column.name} AS ${alias} FROM ${table.table_name}${orderClause}`;
            const elementType = ordinal ? "metric" : "bullet-list";

            return (
              <InlineComboboxItem
                alwaysShow
                key={`${table.table_name}-${column.name}`}
                keywords={[column.name, table.table_name]}
                label={`${column.name} from ${table.table_name}`}
                onClick={() => {
                  insertDataBlock(editor, sql, elementType, `${column.name} from ${table.table_name}`);
                }}
                value={`column-${table.table_name}-${column.name}`}
              >
                <div className="flex size-8 shrink-0 items-center justify-center rounded border border-border bg-background">
                  {ordinal ? (
                    <NumberCircleOne weight="fill" className="size-4 text-muted-foreground" />
                  ) : (
                    <ListBullets weight="fill" className="size-4 text-muted-foreground" />
                  )}
                </div>
                <div className="ml-2 flex flex-1 flex-col truncate">
                  <span className="text-foreground text-sm">
                    <span className="font-medium">{column.name}</span>
                    <span className="text-muted-foreground"> from {table.table_name}</span>
                  </span>
                  <span className="truncate text-muted-foreground text-xs font-mono">
                    {sql}
                  </span>
                </div>
              </InlineComboboxItem>
            );
          })}
        </>
      )}

      {/* Find Data with Hands - only show when no matching data */}
      {hasSearchValue && !hasMatches && (
        <>
          <div className="mt-2.5 mb-2 px-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">
            No matching data
          </div>
          <InlineComboboxItem
            alwaysShow
            keywords={["find", "search", "add", "import", "new", "data", "source"]}
            label="Find Data with Hands"
            onClick={() => insertFindDataBlock(editor, searchValue.trim())}
            value="find-data"
          >
            <div className="flex size-8 shrink-0 items-center justify-center rounded border border-amber-500/30 bg-amber-500/10">
              <MagnifyingGlass weight="bold" className="size-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="ml-2 flex flex-1 flex-col truncate">
              <span className="text-foreground text-sm">Find Data with Hands</span>
              <span className="truncate text-muted-foreground text-xs">
                Search for "{searchValue.trim()}" and add to your data
              </span>
            </div>
            <div className="ml-2 flex items-center gap-1">
              <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                ↓
              </span>
            </div>
          </InlineComboboxItem>
        </>
      )}
    </>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function AtInputElement(props: PlateElementProps) {
  const { children, editor, element } = props;

  return (
    <PlateElement {...props} as="span">
      <InlineCombobox element={element} trigger="@">
        <InlineComboboxInput placeholder="Query data (e.g., 'active users by month')..." />

        <InlineComboboxContent variant="slash">
          <InlineComboboxEmpty>
            <span className="text-muted-foreground">
              Type a natural language query to search your data
            </span>
          </InlineComboboxEmpty>
          <InlineComboboxGroup>
            <AtMenuContent editor={editor} />
          </InlineComboboxGroup>
        </InlineComboboxContent>
      </InlineCombobox>

      {children}
    </PlateElement>
  );
}
