/**
 * LiveQueryStatic - Server Component for SQL Query Rendering
 *
 * RSC component that queries the database and renders results.
 * Uses PlateStatic for consistent rendering with the editor.
 *
 * This is the "static" counterpart to LiveQueryElement (dynamic editor mode).
 *
 * Modes:
 * - Template mode: children contain template with {{field}} bindings
 * - Table mode: columns prop specifies table rendering
 */

import type { TElement, TText } from "platejs";
import { createSlateEditor } from "platejs";
import { PlateStatic } from "platejs/static";
import { type ReactNode, Suspense } from "react";
import { sql } from "../db/dev";

// ============================================================================
// Types (shared with desktop LiveQueryElement)
// ============================================================================

export interface ColumnConfig {
  key: string;
  label: string;
  width?: number;
}

export type LiveQueryMode = "template" | "table";

export interface LiveQueryStaticProps {
  /** SQL query string */
  query: string;
  /** Query parameters (positional) */
  params?: unknown[];
  /** For table mode: column configuration */
  columns?: ColumnConfig[] | "auto";
  /** Custom className for the container */
  className?: string;
  /** Children are the template content with {{field}} bindings */
  children?: (TElement | TText)[];
}

// ============================================================================
// Template Binding System
// ============================================================================

/**
 * Check if children contain actual template content (not just empty text)
 */
function hasTemplateContent(children?: (TElement | TText)[]): boolean {
  if (!children || children.length === 0) return false;
  // Single empty text node means no template
  if (children.length === 1 && "text" in children[0] && !children[0].text) {
    return false;
  }
  return true;
}

function replaceTextBindings(text: string, data: Record<string, unknown>, index?: number): string {
  const keys = Object.keys(data);
  const firstKey = keys[0];

  return text.replace(/\{\{(\w+)\}\}/g, (_, field) => {
    // Special _index field for numbered lists
    if (field === "_index" && index !== undefined) {
      return String(index);
    }

    // Try exact field match first
    if (field in data) {
      const value = data[field];
      if (value === null || value === undefined) return "";
      return String(value);
    }

    // Fallback: "value" or "name" -> use first field
    if ((field === "value" || field === "name") && firstKey) {
      const value = data[firstKey];
      if (value === null || value === undefined) return "";
      return String(value);
    }

    return "";
  });
}

function replaceBindings(
  node: TElement | TText,
  data: Record<string, unknown>,
  index?: number,
): TElement | TText {
  if ("text" in node) {
    return {
      ...node,
      text: replaceTextBindings(String(node.text ?? ""), data, index),
    };
  }

  return {
    ...node,
    children: node.children?.map((child) => replaceBindings(child, data, index)) ?? [],
  };
}

/**
 * Render template with data bindings using PlateStatic
 */
function renderTemplate(
  template: (TElement | TText)[],
  data: Record<string, unknown>,
  index: number,
): ReactNode {
  const boundTemplate = template.map((node) => replaceBindings(node, data, index)) as TElement[];

  const editor = createSlateEditor({
    value: boundTemplate,
  });

  return <PlateStatic editor={editor} />;
}

// ============================================================================
// Table Rendering
// ============================================================================

function autoDetectColumns(data: Record<string, unknown>[]): ColumnConfig[] {
  if (data.length === 0) return [];
  return Object.keys(data[0]).map((key) => ({
    key,
    label: key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, " "),
  }));
}

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (value instanceof Date) return value.toLocaleDateString();
  return String(value);
}

function renderTable(data: Record<string, unknown>[], columns: ColumnConfig[]): ReactNode {
  return (
    <div className="my-4 overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            {columns.map((col) => (
              <th
                key={col.key}
                className="px-4 py-2 text-left text-sm font-medium text-gray-500"
                style={col.width ? { width: col.width } : undefined}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i} className="border-b border-gray-200 last:border-0">
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

// ============================================================================
// Skeleton & Empty States
// ============================================================================

function LiveQuerySkeleton() {
  return (
    <div className="animate-pulse space-y-2 my-4">
      <div className="h-4 bg-gray-200 rounded w-3/4" />
      <div className="h-4 bg-gray-200 rounded w-1/2" />
      <div className="h-4 bg-gray-200 rounded w-2/3" />
    </div>
  );
}

function LiveQueryEmpty() {
  return (
    <div className="my-4 text-center py-8 text-gray-500 text-sm border border-dashed border-gray-300 rounded-lg">
      No data
    </div>
  );
}

// ============================================================================
// Data Fetching Component (async server component)
// ============================================================================

async function LiveQueryData({ query, params = [], children, columns }: LiveQueryStaticProps) {
  // Execute the query
  const parts = query.split("?");
  const strings = parts as unknown as TemplateStringsArray;
  const data = await sql<Record<string, unknown>>(strings, ...params);

  if (data.length === 0) {
    return <LiveQueryEmpty />;
  }

  // Children are the template
  const template = children;
  const isTemplateMode = hasTemplateContent(template) && !columns;

  // Table mode (explicit columns or no template)
  if (columns || !isTemplateMode) {
    const resolvedColumns = columns === "auto" || !columns ? autoDetectColumns(data) : columns;
    return renderTable(data, resolvedColumns);
  }

  // Template mode - use PlateStatic for rendering
  const isSingleRow = data.length === 1;

  if (isSingleRow) {
    return <div className="my-2">{renderTemplate(template!, data[0], 1)}</div>;
  }

  // Multiple rows: render template for each row
  return (
    <div className="my-2 space-y-1">
      {data.map((row, rowIndex) => (
        <div key={rowIndex}>{renderTemplate(template!, row, rowIndex + 1)}</div>
      ))}
    </div>
  );
}

// ============================================================================
// Main Export (with Suspense wrapper)
// ============================================================================

export default function LiveQueryStatic(props: LiveQueryStaticProps) {
  const { className } = props;

  return (
    <div className={className}>
      <Suspense fallback={<LiveQuerySkeleton />}>
        <LiveQueryData {...props} />
      </Suspense>
    </div>
  );
}

export { LiveQueryData };
