/**
 * At Menu - Data query menu for inserting data-bound elements
 *
 * Type "@" to trigger, shows unified list of suggestions sorted by relevance.
 * Two-stage flow: select data source → pick format (insert as).
 *
 * Flow:
 * 1. Type natural language query
 * 2. All matching data shown as suggestions (tables, columns, SQL) sorted by score
 * 3. Select suggestion → shows "Insert as" picker with format options
 * 4. Pick format (inline/metric/list/table) → inserts LiveQuery
 */

import {
  Database,
  Lightning,
  ListBullets,
  MagnifyingGlass,
  Table,
} from "@phosphor-icons/react";
import type { TElement } from "platejs";
import type { PlateEditor, PlateElementProps } from "platejs/react";
import { PlateElement } from "platejs/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { useRuntimeState, type TableSchema } from "@/hooks/useRuntimeState";
import { SANDBOXED_BLOCK_KEY, type TSandboxedBlockElement } from "../SandboxedBlock";
import { textToSQL } from "../lib/text-to-sql";
import {
  LIVE_VALUE_KEY,
  type TLiveValueElement,
  createLiveValueElement,
} from "../plugins/live-query-kit";
import {
  type DataShape,
  type FormatKey,
  inferShapeFromSQL,
  getValidFormats,
  getDefaultFormat,
  getTemplate,
  isTableMode,
  isInlineMode,
} from "../lib/live-query-formats";
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

interface Suggestion {
  id: string;
  type: "table" | "column" | "sql";
  label: string;
  sublabel: string;
  sql: string;
  score: number;
  icon: React.ReactNode;
  /** Data shape determines valid formats */
  shape: DataShape;
}

// ============================================================================
// Insert Function
// ============================================================================

/**
 * Insert a LiveValue block with the given SQL and format.
 * Uses the new unified LiveValue element with display prop.
 */
function insertLiveValueBlock(
  editor: PlateEditor,
  sql: string,
  formatKey: FormatKey
) {
  // Map format key to display mode
  const displayMode = isInlineMode(formatKey) ? "inline" as const
    : isTableMode(formatKey) ? "table" as const
    : "list" as const;

  // Get template for non-table block formats
  const template = !isInlineMode(formatKey) && !isTableMode(formatKey)
    ? getTemplate(formatKey)
    : undefined;

  const node = createLiveValueElement(sql, {
    display: displayMode,
    columns: isTableMode(formatKey) ? "auto" : undefined,
    children: template,
  });

  editor.tf.insertNodes(node);

  // Move cursor after inline elements
  if (isInlineMode(formatKey)) {
    editor.tf.move({ unit: "offset" });
  }
}

/**
 * Insert a "Find Data" block for when no matches found
 */
function insertFindDataBlock(editor: PlateEditor, query: string) {
  const prompt = `Find data source for: "${query}"

The user is looking for data that matches this query but it doesn't exist in the database yet.

Please help them:
1. Search for relevant public APIs, datasets, or data sources
2. Suggest how to import or connect this data
3. If possible, create a source that fetches and imports this data`;

  const node: TSandboxedBlockElement = {
    type: SANDBOXED_BLOCK_KEY,
    editing: true,
    prompt,
    children: [{ text: "" }],
  };
  editor.tf.insertNodes(node);
}

// ============================================================================
// Ordinal Detection
// ============================================================================

const ORDINAL_PATTERNS: Array<{ keywords: string[]; order: "ASC" | "DESC"; offset?: number }> = [
  { keywords: ["first", "1st", "earliest", "oldest"], order: "ASC" },
  { keywords: ["last", "latest", "newest", "most recent"], order: "DESC" },
  { keywords: ["second", "2nd"], order: "ASC", offset: 1 },
  { keywords: ["third", "3rd"], order: "ASC", offset: 2 },
];

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

// ============================================================================
// Fuzzy Scoring
// ============================================================================

function fuzzyScore(query: string, target: string): number {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (q === t) return 1;
  if (t.startsWith(q)) return 0.9;
  if (t.includes(q)) return 0.7;

  let score = 0, qIdx = 0;
  for (let tIdx = 0; tIdx < t.length && qIdx < q.length; tIdx++) {
    if (t[tIdx] === q[qIdx]) { score++; qIdx++; }
  }
  if (qIdx === q.length) return 0.5 * (score / t.length);
  return 0;
}

// ============================================================================
// Build Suggestions
// ============================================================================

function buildSuggestions(
  query: string,
  tables: TableSchema[],
  ordinal: ReturnType<typeof detectOrdinal>
): Suggestion[] {
  if (tables.length === 0) return [];

  const suggestions: Suggestion[] = [];
  const words = query.toLowerCase().split(/\s+/).filter(w =>
    !ORDINAL_PATTERNS.some(p => p.keywords.includes(w))
  );

  // Score and add table suggestions
  for (const table of tables) {
    let tableScore = 0;
    for (const word of words) {
      const s = fuzzyScore(word, table.table_name);
      if (s > tableScore) tableScore = s;
    }

    // Add table suggestion
    if (tableScore > 0.3 || !query.trim()) {
      suggestions.push({
        id: `table-${table.table_name}`,
        type: "table",
        label: table.table_name,
        sublabel: `${table.columns.length} columns`,
        sql: `SELECT * FROM "${table.table_name}"`,
        score: tableScore || 0.5,
        icon: <Table weight="fill" className="size-4 text-muted-foreground" />,
        shape: "table",
      });
    }

    // Score and add column suggestions
    for (const col of table.columns) {
      let colScore = 0;
      for (const word of words) {
        const s = fuzzyScore(word, col.name);
        if (s > colScore) colScore = s;
        // Boost if table also matches
        const ts = fuzzyScore(word, table.table_name);
        if (ts > 0.3) colScore += ts * 0.3;
      }

      if (colScore > 0.3) {
        const orderClause = ordinal
          ? ` ORDER BY rowid ${ordinal.order} LIMIT 1${ordinal.offset > 0 ? ` OFFSET ${ordinal.offset}` : ""}`
          : "";
        const alias = ordinal ? "value" : "name";
        const sql = `SELECT "${col.name}" AS ${alias} FROM "${table.table_name}"${orderClause}`;

        suggestions.push({
          id: `col-${table.table_name}-${col.name}`,
          type: "column",
          label: col.name,
          sublabel: ordinal
            ? `single value from ${table.table_name}`
            : `from ${table.table_name}`,
          sql,
          score: colScore,
          icon: ordinal
            ? <Lightning weight="fill" className="size-4 text-violet-500" />
            : <ListBullets weight="fill" className="size-4 text-muted-foreground" />,
          shape: ordinal ? "single" : "list",
        });
      }
    }
  }

  // Try to generate SQL from natural language
  if (query.trim()) {
    const sqlResult = textToSQL(query, tables);
    if (sqlResult && sqlResult.confidence > 0.4) {
      // Use shape from textToSQL result, with fallback to inference
      const shape: DataShape = (sqlResult.shape as DataShape) ?? inferShapeFromSQL(sqlResult.sql) ?? "table";
      suggestions.push({
        id: "sql-generated",
        type: "sql",
        label: sqlResult.preview,
        sublabel: sqlResult.sql,
        sql: sqlResult.sql,
        score: sqlResult.confidence + 0.5,
        icon: <Database weight="fill" className="size-4 text-violet-500" />,
        shape,
      });
    }
  }

  // Sort by score descending
  return suggestions.sort((a, b) => b.score - a.score).slice(0, 10);
}

// ============================================================================
// Menu Content
// ============================================================================

function AtMenuContent({ editor, element }: { editor: PlateEditor; element: TElement }) {
  const { schema, manifest } = useRuntimeState();
  const searchValue = useInlineComboboxSearchValue();

  // Track which suggestion is being configured for "insert as"
  const [insertAsSuggestion, setInsertAsSuggestion] = useState<Suggestion | null>(null);

  // Keyboard navigation state
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Normalize tables from schema or manifest
  const tables: TableSchema[] = useMemo(() => {
    if (schema.length > 0) return schema;
    if (manifest?.tables?.length) {
      return manifest.tables.map(t => ({
        table_name: t.name,
        columns: t.columns.map(col => ({ name: col, type: "TEXT", nullable: true })),
      }));
    }
    return [];
  }, [schema, manifest?.tables]);

  const hasSearchValue = searchValue && searchValue.trim().length > 0;
  const ordinal = useMemo(() =>
    hasSearchValue ? detectOrdinal(searchValue) : null,
    [searchValue, hasSearchValue]
  );

  // Build unified suggestions list
  const suggestions = useMemo(() =>
    buildSuggestions(hasSearchValue ? searchValue : "", tables, ordinal),
    [searchValue, hasSearchValue, tables, ordinal]
  );

  const hasSuggestions = suggestions.length > 0;

  // Get valid formats for the selected suggestion's shape
  const validFormats = useMemo(() =>
    insertAsSuggestion ? getValidFormats(insertAsSuggestion.shape) : [],
    [insertAsSuggestion]
  );

  // Reset selection when suggestions or formats change
  useEffect(() => {
    setSelectedIndex(0);
  }, [suggestions.length, searchValue, insertAsSuggestion]);

  // Select suggestion (show insert-as picker)
  const selectSuggestion = useCallback((suggestion: Suggestion) => {
    setInsertAsSuggestion(suggestion);
    setSelectedIndex(0);
  }, []);

  // Insert with format
  const doInsert = useCallback((suggestion: Suggestion, formatKey: FormatKey) => {
    const path = editor.api.findPath(element);
    if (path) {
      editor.tf.removeNodes({ at: path });
    }
    insertLiveValueBlock(editor, suggestion.sql, formatKey);
    setInsertAsSuggestion(null);
  }, [editor, element]);

  // Keyboard navigation
  useEffect(() => {
    if (!hasSuggestions && !insertAsSuggestion) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // In insert-as picker mode
      if (insertAsSuggestion && validFormats.length > 0) {
        const optionCount = validFormats.length;
        if (e.key === "ArrowLeft" || e.key === "ArrowUp" || (e.key === "Tab" && e.shiftKey)) {
          e.preventDefault();
          setSelectedIndex(i => (i - 1 + optionCount) % optionCount);
        } else if (e.key === "ArrowRight" || e.key === "ArrowDown" || (e.key === "Tab" && !e.shiftKey)) {
          e.preventDefault();
          setSelectedIndex(i => (i + 1) % optionCount);
        } else if (e.key === "Enter") {
          e.preventDefault();
          const format = validFormats[selectedIndex];
          if (format) {
            doInsert(insertAsSuggestion, format.key);
          }
        } else if (e.key === "Escape" || e.key === "Backspace") {
          e.preventDefault();
          setInsertAsSuggestion(null);
          setSelectedIndex(0);
        }
        return;
      }

      // In suggestions mode
      if (e.key === "ArrowUp" || (e.key === "Tab" && e.shiftKey)) {
        e.preventDefault();
        setSelectedIndex(i => (i - 1 + suggestions.length) % suggestions.length);
      } else if (e.key === "ArrowDown" || (e.key === "Tab" && !e.shiftKey)) {
        e.preventDefault();
        setSelectedIndex(i => (i + 1) % suggestions.length);
      } else if (e.key === "Enter") {
        e.preventDefault();
        const suggestion = suggestions[selectedIndex];
        if (suggestion) {
          selectSuggestion(suggestion);
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [hasSuggestions, suggestions, selectedIndex, insertAsSuggestion, validFormats, doInsert, selectSuggestion]);

  return (
    <>
      {/* Insert-As picker - shows when a suggestion is selected */}
      {insertAsSuggestion && (
        <div>
          <div className="mt-1.5 mb-2 px-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">
            Insert as
          </div>
          <div className="px-2 pb-2">
            <div className="flex items-center gap-1 p-1.5 bg-muted/30 rounded-lg border border-border mb-2">
              <div className="flex size-6 shrink-0 items-center justify-center">
                {insertAsSuggestion.icon}
              </div>
              <span className="text-sm font-medium truncate flex-1">{insertAsSuggestion.label}</span>
              <button
                onClick={() => setInsertAsSuggestion(null)}
                className="text-xs text-muted-foreground hover:text-foreground px-1"
              >
                ←
              </button>
            </div>
            <div className={cn(
              "grid gap-1",
              validFormats.length <= 2 ? "grid-cols-2" :
              validFormats.length === 3 ? "grid-cols-3" : "grid-cols-4"
            )}>
              {validFormats.map((format, index) => (
                <button
                  key={format.key}
                  onClick={() => doInsert(insertAsSuggestion, format.key)}
                  className={cn(
                    "flex flex-col items-center gap-1 p-2 rounded-md transition-colors",
                    index === selectedIndex
                      ? "bg-violet-500/20 text-violet-600 dark:text-violet-400 ring-1 ring-violet-500/50"
                      : "hover:bg-violet-500/10 hover:text-violet-600 dark:hover:text-violet-400 text-muted-foreground"
                  )}
                  title={format.description}
                >
                  {format.icon}
                  <span className="text-[10px] font-medium">{format.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Unified suggestions list sorted by relevance */}
      {!insertAsSuggestion && hasSuggestions && (
        <>
          <div className="mt-1.5 mb-2 px-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">
            {hasSearchValue ? "Suggestions" : "My Data"}
          </div>
          {suggestions.map((suggestion, index) => (
            <button
              key={suggestion.id}
              type="button"
              onClick={() => selectSuggestion(suggestion)}
              className={cn(
                "relative mx-1 flex w-[calc(100%-8px)] select-none items-center rounded-sm px-2 py-1 text-foreground text-sm outline-hidden transition-bg-ease",
                "cursor-pointer",
                index === selectedIndex
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <div className="flex size-8 shrink-0 items-center justify-center rounded border border-border bg-background">
                {suggestion.icon}
              </div>
              <div className="ml-2 flex flex-1 flex-col truncate text-left">
                <span className="text-foreground text-sm font-medium">
                  {suggestion.label}
                </span>
                <span className="truncate text-muted-foreground text-xs">
                  {suggestion.type === "sql" ? (
                    <span className="font-mono">{suggestion.sublabel}</span>
                  ) : (
                    suggestion.sublabel
                  )}
                </span>
              </div>
              <div className="ml-2 opacity-50 group-hover:opacity-100 transition-opacity">
                <span className="text-[10px] text-muted-foreground">
                  pick format →
                </span>
              </div>
            </button>
          ))}
        </>
      )}

      {/* Find Data - only when no matches and not in insert-as mode */}
      {!insertAsSuggestion && hasSearchValue && !hasSuggestions && (
        <>
          <div className="mt-2.5 mb-2 px-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">
            No matching data
          </div>
          <InlineComboboxItem
            alwaysShow
            keywords={["find", "search", "add", "import"]}
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
        <InlineComboboxInput
          placeholder="Search your data..."
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
        />

        <InlineComboboxContent variant="slash">
          <InlineComboboxEmpty>
            <span className="text-muted-foreground">
              Type to search tables and columns
            </span>
          </InlineComboboxEmpty>
          <InlineComboboxGroup className="!block">
            <AtMenuContent editor={editor} element={element} />
          </InlineComboboxGroup>
        </InlineComboboxContent>
      </InlineCombobox>

      {children}
    </PlateElement>
  );
}
