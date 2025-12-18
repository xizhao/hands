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

import type { TElement, TText } from "platejs";
import {
  createPlatePlugin,
  Plate,
  PlateContent,
  PlateElement,
  type PlateElementProps,
  useElement,
  usePlateEditor,
  useReadOnly,
  useSelected,
} from "platejs/react";
import { memo, useMemo, type ReactNode } from "react";

import { cn } from "@/lib/utils";
import { useLiveQuery } from "@/lib/live-query";
import { useActiveRuntime } from "@/hooks/useWorkbook";
import {
  LiveQueryProvider,
  replaceTextBindings,
} from "../lib/live-query-context";
import { BasicBlocksKit } from "./basic-blocks-kit";
import { BasicMarksKit } from "./basic-marks-kit";

// ============================================================================
// Types
// ============================================================================

export const LIVE_QUERY_KEY = "live_query";

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
 * Minimal plugins for the nested live template editor.
 * Supports basic blocks and marks for template rendering.
 */
const LiveTemplatePlugins = [
  ...BasicBlocksKit,
  ...BasicMarksKit,
];

/**
 * Component to render template content using a nested Plate editor.
 * Uses dynamic editor for future DnD and interactive features.
 */
function LiveTemplateEditor({
  template,
  data,
  rows,
  index,
  readOnly = true,
}: {
  template: (TElement | TText)[];
  data: Record<string, unknown>;
  rows: Record<string, unknown>[];
  index: number;
  readOnly?: boolean;
}) {
  // Transform template with data bindings
  const boundTemplate = useMemo(
    () => template.map((node) => replaceBindings(node, data, index)) as TElement[],
    [template, data, index]
  );

  // Create a nested editor with usePlateEditor
  const editor = usePlateEditor({
    plugins: LiveTemplatePlugins,
    value: boundTemplate,
  });

  return (
    <LiveQueryProvider row={data} rows={rows} index={index}>
      <Plate editor={editor}>
        <PlateContent
          readOnly={readOnly}
          className="outline-none"
        />
      </Plate>
    </LiveQueryProvider>
  );
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

  // Determine what to render
  const content = useMemo(() => {
    if (isLoading) return <LiveQuerySkeleton />;
    if (error) return <LiveQueryError error={error} onRetry={refetch} />;
    if (!data || data.length === 0) return <LiveQueryEmpty />;

    // Table mode (explicit columns or no template)
    if (columns || !isTemplateMode) {
      const resolvedColumns = columns === "auto" || !columns
        ? autoDetectColumns(data)
        : columns;
      return renderTable(data, resolvedColumns);
    }

    // Template mode - use nested Plate editor for native rendering
    const isSingleRow = data.length === 1;

    if (isSingleRow) {
      // Single row: render template once with bindings
      return (
        <div className="my-2">
          <LiveTemplateEditor
            template={template}
            data={data[0]}
            rows={data}
            index={1}
          />
        </div>
      );
    }

    // Multiple rows: render template for each row
    return (
      <div className="my-2 space-y-1">
        {data.map((row, rowIndex) => (
          <div key={rowIndex}>
            <LiveTemplateEditor
              template={template}
              data={row}
              rows={data}
              index={rowIndex + 1}
            />
          </div>
        ))}
      </div>
    );
  }, [data, isLoading, error, template, columns, isTemplateMode, refetch]);

  return (
    <PlateElement
      {...props}
      className={cn(
        "relative",
        selected && !readOnly && "ring-2 ring-ring ring-offset-2 rounded-lg",
        className
      )}
    >
      <div contentEditable={false}>
        {/* Edit mode indicator */}
        {!readOnly && selected && (
          <div className="absolute -top-6 left-0 px-2 py-0.5 bg-primary text-primary-foreground text-xs rounded-t-md font-mono">
            LiveQuery
          </div>
        )}

        {content}

        {/* Query debug (shown when selected in edit mode) */}
        {selected && !readOnly && (
          <div className="mt-2 p-2 bg-muted/50 rounded text-xs font-mono text-muted-foreground border border-border">
            <div className="truncate">{query}</div>
            {params && Object.keys(params).length > 0 && (
              <div className="mt-1 text-[10px] opacity-70">
                Params: {JSON.stringify(params)}
              </div>
            )}
          </div>
        )}
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
};

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

export const LiveQueryKit = [LiveQueryPlugin];

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
