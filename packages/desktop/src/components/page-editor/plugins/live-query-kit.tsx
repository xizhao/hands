"use client";

/**
 * LiveQuery Plugin
 *
 * Renders live SQL query results as native Plate elements.
 * Children contain the template with {{field}} bindings that get replaced with data.
 *
 * Uses PlateStatic for template rendering instead of custom renderPlateNode.
 * Provides LiveQueryContext for data binding.
 *
 * Modes:
 * - Template mode: <LiveQuery query="...">template content</LiveQuery>
 * - Table mode: <LiveQuery query="..." columns="auto" />
 */

import { Lightning } from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";
import { createSlateEditor, type TElement, type TText } from "platejs";
import {
  createPlatePlugin,
  PlateElement,
  type PlateElementProps,
  useElement,
  useReadOnly,
  useSelected,
} from "platejs/react";
import { PlateStatic } from "platejs/static";
import { memo, useMemo, useCallback, type ReactNode } from "react";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useLiveQuery } from "@/lib/live-query";
import { useActiveRuntime } from "@/hooks/useWorkbook";
import { replaceTextBindings } from "../lib/live-query-context";

// ============================================================================
// Types
// ============================================================================

export const LIVE_QUERY_KEY = "live_query";
export const INLINE_LIVE_QUERY_KEY = "live_query_inline";

export interface ColumnConfig {
  key: string;
  label: string;
  width?: number;
  sortable?: boolean;
  filterable?: boolean;
}

export interface TLiveQueryElement extends TElement {
  type: typeof LIVE_QUERY_KEY;
  /** SQL query string */
  query: string;
  /** Named parameters */
  params?: Record<string, unknown>;
  /** For table mode: column configuration (if set, ignores children template) */
  columns?: ColumnConfig[] | "auto";
  /** CSS class for the container */
  className?: string;
  /** Children are the template content with {{field}} bindings */
  children: (TElement | TText)[];
}

/**
 * Inline LiveQuery element - renders as a badge/span within text.
 * Used for single values that should appear inline, like "I have {{count}} customers"
 */
export interface TInlineLiveQueryElement extends TElement {
  type: typeof INLINE_LIVE_QUERY_KEY;
  /** SQL query string */
  query: string;
  /** Named parameters */
  params?: Record<string, unknown>;
  /** CSS class for the inline element */
  className?: string;
  /** Children must be empty for void inline element */
  children: [{ text: "" }];
}

// ============================================================================
// Template Binding System
// ============================================================================

/**
 * Check if children contain actual template content (not just empty text)
 */
function hasTemplateContent(children: (TElement | TText)[]): boolean {
  if (!children || children.length === 0) return false;
  // Single empty text node means no template
  if (children.length === 1 && "text" in children[0] && !children[0].text) {
    return false;
  }
  return true;
}

/**
 * Deep clone a Plate node and replace all {{field}} bindings
 */
function replaceBindings(
  node: TElement | TText,
  data: Record<string, unknown>,
  index?: number
): TElement | TText {
  // Text node - replace bindings in text
  if ("text" in node) {
    return {
      ...node,
      text: replaceTextBindings(String(node.text ?? ""), data, index),
    };
  }

  // Element node - recurse into children
  return {
    ...node,
    children: node.children?.map((child) => replaceBindings(child, data, index)) ?? [],
  };
}

/**
 * Render bound template using PlateStatic.
 *
 * Uses Plate's static renderer for read-only content - lightweight, no editor overhead.
 * The template is pre-processed to replace {{field}} bindings with actual data.
 */
function renderBoundTemplate(
  template: (TElement | TText)[],
  data: Record<string, unknown>,
  index: number
): ReactNode {
  // Deep clone and replace bindings
  const boundValue = template.map((node) =>
    replaceBindings(node, data, index)
  ) as TElement[];

  // Create lightweight static editor
  const editor = createSlateEditor({ value: boundValue });

  return <PlateStatic editor={editor} className="pointer-events-none" />;
}

// ============================================================================
// Table Generation
// ============================================================================

/**
 * Generate columns from data if set to "auto"
 */
function autoDetectColumns(data: Record<string, unknown>[]): ColumnConfig[] {
  if (data.length === 0) return [];
  const firstRow = data[0];
  return Object.keys(firstRow).map((key) => ({
    key,
    label: key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, " "),
  }));
}

/**
 * Render data as a native HTML table (styled to match Plate tables)
 */
function renderTable(
  data: Record<string, unknown>[],
  columns: ColumnConfig[]
): ReactNode {
  return (
    <div className="my-4 overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-muted/50 border-b border-border">
            {columns.map((col) => (
              <th
                key={col.key}
                className="px-4 py-2 text-left text-sm font-medium text-muted-foreground"
                style={col.width ? { width: col.width } : undefined}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/30">
              {columns.map((col) => (
                <td key={col.key} className="px-4 py-2 text-sm">
                  {formatCellValue(row[col.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (value instanceof Date) return value.toLocaleDateString();
  return String(value);
}

// ============================================================================
// Auto Display Selection (DRY - single code path)
// ============================================================================

export type DisplayType = "inline-value" | "bullet-list" | "table";

/**
 * Select the most minimal display type based on data shape.
 * Used by both LiveQuery (block) and ghost-prompt insertion.
 */
export function selectDisplayType(data: Record<string, unknown>[]): DisplayType {
  if (!data || data.length === 0) return "table";

  const rowCount = data.length;
  const colCount = Object.keys(data[0]).length;

  // Single value (1 row, 1 col) → inline value
  if (rowCount === 1 && colCount === 1) {
    return "inline-value";
  }

  // Multiple rows, single col → bullet list
  if (colCount === 1) {
    return "bullet-list";
  }

  // Everything else → table
  return "table";
}

/**
 * Render inline value badge (same style as InlineLiveQueryElement)
 */
function renderInlineValue(value: unknown, query?: string): ReactNode {
  const queryRef = extractQueryReference(query);
  const tooltip = queryRef.column
    ? `${queryRef.table}.${queryRef.column}`
    : queryRef.table || "Live Query";

  return (
    <span
      title={tooltip}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-medium text-sm bg-violet-500/10 text-violet-700 dark:text-violet-300 border border-violet-500/20"
    >
      <Lightning weight="fill" className="size-3 shrink-0 opacity-60" />
      <span className="tabular-nums">{formatCellValue(value)}</span>
    </span>
  );
}

/**
 * Render bullet list
 */
function renderBulletList(data: Record<string, unknown>[]): ReactNode {
  const key = Object.keys(data[0])[0];
  return (
    <ul className="my-2 space-y-0.5 list-disc list-inside text-sm">
      {data.map((row, i) => (
        <li key={i}>{formatCellValue(row[key])}</li>
      ))}
    </ul>
  );
}

/**
 * Auto-render data based on shape (DRY helper)
 */
export function renderAutoDisplay(
  data: Record<string, unknown>[],
  query?: string
): ReactNode {
  const displayType = selectDisplayType(data);

  switch (displayType) {
    case "inline-value": {
      const value = data[0][Object.keys(data[0])[0]];
      return renderInlineValue(value, query);
    }
    case "bullet-list":
      return renderBulletList(data);
    case "table":
      return renderTable(data, autoDetectColumns(data));
  }
}

// ============================================================================
// Loading & Error States
// ============================================================================

function LiveQuerySkeleton() {
  return (
    <div className="animate-pulse space-y-2 my-4">
      <div className="h-4 bg-muted/50 rounded w-3/4" />
      <div className="h-4 bg-muted/50 rounded w-1/2" />
      <div className="h-4 bg-muted/50 rounded w-2/3" />
    </div>
  );
}

function LiveQueryError({ error, onRetry }: { error: Error; onRetry: () => void }) {
  return (
    <div className="my-4 rounded-lg border border-destructive/50 bg-destructive/10 p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-destructive">Query Error</p>
          <p className="text-xs text-destructive/80 mt-1">{error.message}</p>
        </div>
        <button
          onClick={onRetry}
          className="px-3 py-1 text-xs bg-destructive/20 hover:bg-destructive/30 text-destructive rounded transition-colors"
        >
          Retry
        </button>
      </div>
    </div>
  );
}

function LiveQueryEmpty() {
  return (
    <div className="my-4 text-center py-8 text-muted-foreground text-sm border border-dashed border-border rounded-lg">
      No data
    </div>
  );
}

// ============================================================================
// Inline LiveQuery Component (badge/span style)
// ============================================================================

/**
 * InlineLiveQueryElement - Renders a single SQL value as an inline badge.
 * Used within text like: "I have <inline-live-query>300</inline-live-query> customers"
 *
 * Follows Plate inline element patterns:
 * - isInline: true, isVoid: true in plugin config
 * - Renders as inline-block span
 * - contentEditable={false} on content
 * - children included but empty for void
 *
 * Features:
 * - Hover: Shows tooltip with table.column reference
 * - Click: Navigates to the table page
 */
function InlineLiveQueryElement(props: PlateElementProps) {
  const element = useElement<TInlineLiveQueryElement>();
  const readOnly = useReadOnly();
  const selected = useSelected();
  const navigate = useNavigate();
  const { data: runtime } = useActiveRuntime();
  const runtimePort = runtime?.runtime_port ?? null;

  const { query, params, className } = element;

  // Convert named params to positional array
  const paramArray = useMemo(() => {
    if (!params) return [];
    return Object.values(params);
  }, [params]);

  const { data, isLoading, error } = useLiveQuery<Record<string, unknown>>({
    sql: query,
    params: paramArray,
    enabled: !!query && !!runtimePort,
    runtimePort,
  });

  // Extract the first value from the first row
  const displayValue = useMemo(() => {
    if (!data || data.length === 0) return null;
    const row = data[0];
    const keys = Object.keys(row);
    if (keys.length === 0) return null;
    const value = row[keys[0]];
    if (value === null || value === undefined) return null;
    return String(value);
  }, [data]);

  // Extract table/column reference for tooltip and navigation
  const queryRef = useMemo(() => extractQueryReference(query), [query]);

  // Build tooltip content
  const tooltipContent = useMemo(() => {
    if (queryRef.column && queryRef.table) {
      return (
        <div className="flex flex-col gap-0.5">
          <span className="opacity-70">from</span>
          <span>{queryRef.table}.{queryRef.column}</span>
        </div>
      );
    }
    if (queryRef.table) {
      return (
        <div className="flex flex-col gap-0.5">
          <span className="opacity-70">from</span>
          <span>{queryRef.table}</span>
        </div>
      );
    }
    return "Live Query";
  }, [queryRef]);

  // Navigate to table on click
  const handleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (queryRef.table) {
      navigate({ to: "/tables/$tableId", params: { tableId: queryRef.table } });
    }
  }, [navigate, queryRef.table]);

  const badge = (
    <span
      onClick={queryRef.table ? handleClick : undefined}
      className={cn(
        "inline font-semibold text-violet-600 dark:text-violet-400 transition-colors",
        // Dashed underline
        "underline decoration-dashed decoration-violet-400/50 underline-offset-2",
        // Selected state
        selected && !readOnly && "bg-violet-500/10 rounded px-0.5 -mx-0.5",
        // Hover state
        queryRef.table ? "cursor-pointer hover:text-violet-700 dark:hover:text-violet-300 hover:decoration-violet-500" : "hover:decoration-violet-400"
      )}
    >
      {isLoading ? (
        <span className="animate-pulse">...</span>
      ) : error ? (
        <span className="text-destructive">err</span>
      ) : displayValue === null ? (
        <span className="text-muted-foreground italic">—</span>
      ) : (
        <span className="tabular-nums">{displayValue}</span>
      )}
    </span>
  );

  return (
    <PlateElement
      {...props}
      attributes={{
        ...props.attributes,
        contentEditable: false,
        "data-slate-value": displayValue ?? "",
        draggable: true,
      }}
      className={cn(
        "inline-block align-baseline",
        className
      )}
    >
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            {badge}
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={6}>
            {tooltipContent}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      {props.children}
    </PlateElement>
  );
}

// ============================================================================
// Main Component
// ============================================================================

function LiveQueryElement(props: PlateElementProps) {
  const element = useElement<TLiveQueryElement>();
  const readOnly = useReadOnly();
  const selected = useSelected();
  const { data: runtime } = useActiveRuntime();
  const runtimePort = runtime?.runtime_port ?? null;

  const { query, params, columns, className } = element;

  // Children are the template
  const template = element.children;
  const isTemplateMode = hasTemplateContent(template) && !columns;

  // Convert named params to positional array
  const paramArray = useMemo(() => {
    if (!params) return [];
    return Object.values(params);
  }, [params]);

  const { data, isLoading, error, refetch } = useLiveQuery<Record<string, unknown>>({
    sql: query,
    params: paramArray,
    enabled: !!query && !!runtimePort,
    runtimePort,
  });

  // Extract table/column reference for the chip
  const queryRef = useMemo(() => extractQueryReference(query), [query]);

  // Determine what to render - auto-pick best template based on data shape
  const content = useMemo(() => {
    if (isLoading) return <LiveQuerySkeleton />;
    if (error) return <LiveQueryError error={error} onRetry={refetch} />;
    if (!data || data.length === 0) return <LiveQueryEmpty />;

    // If explicit template provided, use it
    if (isTemplateMode) {
      const isSingleRow = data.length === 1;
      if (isSingleRow) {
        return (
          <div className="my-2">
            {renderBoundTemplate(template, data[0], 1)}
          </div>
        );
      }
      return (
        <div className="my-2 space-y-1">
          {data.map((row, rowIndex) => (
            <div key={rowIndex}>
              {renderBoundTemplate(template, row, rowIndex + 1)}
            </div>
          ))}
        </div>
      );
    }

    // If explicit columns provided, use table
    if (columns) {
      const resolvedColumns = columns === "auto"
        ? autoDetectColumns(data)
        : columns;
      return renderTable(data, resolvedColumns);
    }

    // AUTO-PICK: No template or columns - use DRY helper
    return renderAutoDisplay(data, query);
  }, [data, isLoading, error, template, columns, isTemplateMode, refetch]);

  const showChip = selected && !readOnly;

  return (
    <PlateElement
      {...props}
      className={cn(
        "relative group rounded-lg transition-colors",
        // Padding for clickable area
        "py-2 -mx-2 px-2",
        // Hover state
        !selected && "hover:bg-muted/30",
        // Selected state
        selected && !readOnly && "bg-muted/40 ring-2 ring-violet-500/50",
        className
      )}
    >
      <div contentEditable={false}>
        {/* Purple chip with lightning bolt - shown when selected */}
        {showChip && (
          <div className="absolute -top-7 left-0 flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-violet-500/10 border border-violet-500/30 text-violet-600 dark:text-violet-400">
              <Lightning weight="fill" className="size-3.5" />
              <span className="text-xs font-medium">
                {queryRef.column ? (
                  <>
                    <span className="opacity-70">{queryRef.table}.</span>
                    {queryRef.column}
                  </>
                ) : queryRef.table ? (
                  queryRef.table
                ) : (
                  "Query"
                )}
              </span>
            </div>
          </div>
        )}

        {content}
      </div>
      {/* Hidden children for Plate - template is rendered via content above */}
      <div className="hidden">{props.children}</div>
    </PlateElement>
  );
}

// ============================================================================
// Default Templates (as Plate element arrays for insertion)
// ============================================================================

export const TEMPLATES = {
  metric: [
    { type: "h1", children: [{ text: "{{value}}" }] },
  ] as TElement[],

  "stat-card": [
    { type: "h3", children: [{ text: "{{value}}" }] },
    { type: "p", className: "text-muted-foreground text-sm", children: [{ text: "{{label}}" }] },
  ] as TElement[],

  "bullet-list": [
    { type: "p", children: [{ text: "• {{name}}" }] },
  ] as TElement[],

  "numbered-list": [
    { type: "p", children: [{ text: "{{_index}}. {{name}}" }] },
  ] as TElement[],

  card: [
    { type: "h3", children: [{ text: "{{title}}" }] },
    { type: "p", children: [{ text: "{{description}}" }] },
  ] as TElement[],

  row: [
    { type: "p", children: [
      { text: "{{name}}", bold: true },
      { text: " — " },
      { text: "{{value}}" },
    ]},
  ] as TElement[],

  table: [] as TElement[], // Empty = table mode
};

export type TemplateKey = keyof typeof TEMPLATES;

/**
 * Extract table/column reference from SQL query for display
 */
function extractQueryReference(sql: string | undefined): { table?: string; column?: string } {
  if (!sql) return {};
  const fromMatch = sql.match(/FROM\s+["']?(\w+)["']?/i);
  const selectMatch = sql.match(/SELECT\s+([\w,\s*]+)\s+FROM/i);

  const table = fromMatch?.[1];
  let column: string | undefined;

  if (selectMatch) {
    const cols = selectMatch[1].trim();
    if (cols !== "*") {
      // Get first column, remove alias
      column = cols.split(",")[0].trim().split(/\s+AS\s+/i)[0].trim();
    }
  }

  return { table, column };
}

// ============================================================================
// Plugin
// ============================================================================

export const LiveQueryPlugin = createPlatePlugin({
  key: LIVE_QUERY_KEY,
  node: {
    isElement: true,
    // NOT void - children are the template content
    isVoid: false,
    component: memo(LiveQueryElement),
  },
});

/**
 * Inline LiveQuery Plugin
 *
 * Renders single values as inline badges within text.
 * Configured as inline + void element following Plate conventions.
 */
export const InlineLiveQueryPlugin = createPlatePlugin({
  key: INLINE_LIVE_QUERY_KEY,
  node: {
    isElement: true,
    isInline: true,
    isVoid: true,
    component: memo(InlineLiveQueryElement),
  },
});

export const LiveQueryKit = [LiveQueryPlugin, InlineLiveQueryPlugin];

// ============================================================================
// Insertion Helpers
// ============================================================================

export function createLiveQueryElement(
  query: string,
  options?: {
    params?: Record<string, unknown>;
    columns?: ColumnConfig[] | "auto";
    /** Template children - if not provided, uses empty text (table mode) */
    children?: (TElement | TText)[];
  }
): TLiveQueryElement {
  return {
    type: LIVE_QUERY_KEY,
    query,
    params: options?.params,
    columns: options?.columns,
    // Children are the template content
    children: options?.children ?? [{ text: "" }],
  };
}

export function createTableQuery(query: string, columns?: ColumnConfig[]): TLiveQueryElement {
  return createLiveQueryElement(query, { columns: columns ?? "auto" });
}

export function createTemplateQuery(query: string, template: (TElement | TText)[]): TLiveQueryElement {
  return createLiveQueryElement(query, { children: template });
}

/**
 * Create an inline LiveQuery element for single values.
 * Renders as a badge/span within text flow.
 */
export function createInlineLiveQueryElement(
  query: string,
  params?: Record<string, unknown>
): TInlineLiveQueryElement {
  return {
    type: INLINE_LIVE_QUERY_KEY,
    query,
    params,
    children: [{ text: "" }],
  };
}

// ============================================================================
// Markdown Serialization
// ============================================================================

/**
 * Serialize LiveQuery element to MDX.
 *
 * Table mode (no children or columns prop):
 *   <LiveQuery query="SELECT * FROM users" columns="auto" />
 *
 * Template mode (has children):
 *   <LiveQuery query="SELECT name, value FROM metrics">
 *
 *   # {{value}}
 *
 *   *{{name}}*
 *
 *   </LiveQuery>
 *
 * Children are serialized by Plate's markdown plugin automatically
 * since isVoid is false.
 */
export const liveQueryMarkdownRule = {
  [LIVE_QUERY_KEY]: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    serialize: (node: TLiveQueryElement, options?: any) => {
      const attributes: Array<{ type: "mdxJsxAttribute"; name: string; value: unknown }> = [
        { type: "mdxJsxAttribute", name: "query", value: node.query },
      ];

      // Add params if present
      if (node.params && Object.keys(node.params).length > 0) {
        attributes.push({
          type: "mdxJsxAttribute",
          name: "params",
          value: { type: "mdxJsxAttributeValueExpression", value: JSON.stringify(node.params) },
        });
      }

      // Add columns if present (table mode)
      if (node.columns) {
        if (node.columns === "auto") {
          attributes.push({ type: "mdxJsxAttribute", name: "columns", value: "auto" });
        } else {
          attributes.push({
            type: "mdxJsxAttribute",
            name: "columns",
            value: { type: "mdxJsxAttributeValueExpression", value: JSON.stringify(node.columns) },
          });
        }
      }

      // Add className if present
      if (node.className) {
        attributes.push({ type: "mdxJsxAttribute", name: "className", value: node.className });
      }

      // Get serialized children from options if available, otherwise Plate handles it
      const children = options?.children ?? [];

      return {
        type: "mdxJsxFlowElement",
        name: "LiveQuery",
        attributes,
        children,
      };
    },
  },

  /**
   * Serialize InlineLiveQuery element to MDX.
   * Renders as: <LiveValue query="SELECT ..." />
   * Uses mdxJsxTextElement for inline rendering.
   */
  [INLINE_LIVE_QUERY_KEY]: {
    serialize: (node: TInlineLiveQueryElement) => {
      const attributes: Array<{ type: "mdxJsxAttribute"; name: string; value: unknown }> = [
        { type: "mdxJsxAttribute", name: "query", value: node.query },
      ];

      // Add params if present
      if (node.params && Object.keys(node.params).length > 0) {
        attributes.push({
          type: "mdxJsxAttribute",
          name: "params",
          value: { type: "mdxJsxAttributeValueExpression", value: JSON.stringify(node.params) },
        });
      }

      // Add className if present
      if (node.className) {
        attributes.push({ type: "mdxJsxAttribute", name: "className", value: node.className });
      }

      return {
        type: "mdxJsxTextElement", // Inline element
        name: "LiveValue",
        attributes,
        children: [],
      };
    },
  },
};

/**
 * Deserialize <LiveQuery> MDX element to TLiveQueryElement.
 * Children are deserialized by Plate's markdown plugin automatically.
 */
export function deserializeLiveQueryElement(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  node: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _options?: any
): TLiveQueryElement {
  const attributes = node.attributes || [];
  const props: Record<string, unknown> = {};

  for (const attr of attributes) {
    if (attr.type === "mdxJsxAttribute") {
      const name = attr.name;
      const value = attr.value;

      if (value === null || value === undefined) {
        props[name] = true;
      } else if (typeof value === "string") {
        props[name] = value;
      } else if (typeof value === "object" && value !== null) {
        // Expression value like params={{...}} or columns={[...]}
        const expr = value as Record<string, unknown>;
        if (expr.type === "mdxJsxAttributeValueExpression" && typeof expr.value === "string") {
          try {
            props[name] = JSON.parse(expr.value);
          } catch {
            props[name] = expr.value;
          }
        }
      }
    }
  }

  // Return element - Plate will handle children deserialization for non-void elements
  return {
    type: LIVE_QUERY_KEY,
    query: (props.query as string) || "",
    params: props.params as Record<string, unknown> | undefined,
    columns: props.columns as ColumnConfig[] | "auto" | undefined,
    className: props.className as string | undefined,
    // Plate fills in children from the MDX content for non-void elements
    children: [{ text: "" }],
  };
}

/**
 * Deserialize <LiveValue> MDX element to TInlineLiveQueryElement.
 * Inline void element - no children.
 */
export function deserializeInlineLiveQueryElement(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  node: any
): TInlineLiveQueryElement {
  const attributes = node.attributes || [];
  const props: Record<string, unknown> = {};

  for (const attr of attributes) {
    if (attr.type === "mdxJsxAttribute") {
      const name = attr.name;
      const value = attr.value;

      if (value === null || value === undefined) {
        props[name] = true;
      } else if (typeof value === "string") {
        props[name] = value;
      } else if (typeof value === "object" && value !== null) {
        const expr = value as Record<string, unknown>;
        if (expr.type === "mdxJsxAttributeValueExpression" && typeof expr.value === "string") {
          try {
            props[name] = JSON.parse(expr.value);
          } catch {
            props[name] = expr.value;
          }
        }
      }
    }
  }

  return {
    type: INLINE_LIVE_QUERY_KEY,
    query: (props.query as string) || "",
    params: props.params as Record<string, unknown> | undefined,
    className: props.className as string | undefined,
    children: [{ text: "" }],
  };
}
