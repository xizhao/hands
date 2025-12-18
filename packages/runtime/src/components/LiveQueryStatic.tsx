/**
 * LiveQueryStatic - Server Component for SQL Query Rendering
 *
 * RSC component that queries the database and renders results.
 * Uses the same template binding system as the editor's LiveQueryElement.
 *
 * This is the "static" counterpart to LiveQueryElement (dynamic editor mode).
 *
 * Modes:
 * - Template mode: children contain template with {{field}} bindings
 * - Table mode: columns prop specifies table rendering
 */

import { Suspense, type ReactNode } from "react";
import { sql } from "../db/dev";

// ============================================================================
// Types (shared with desktop LiveQueryElement)
// ============================================================================

export interface ColumnConfig {
  key: string;
  label: string;
  width?: number;
}

export interface TemplateNode {
  type: string;
  className?: string;
  children?: (TemplateNode | TextNode)[];
}

export interface TextNode {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  code?: boolean;
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
  children?: (TemplateNode | TextNode)[];
}

// ============================================================================
// Template Binding System
// ============================================================================

/**
 * Check if children contain actual template content (not just empty text)
 */
function hasTemplateContent(children?: (TemplateNode | TextNode)[]): boolean {
  if (!children || children.length === 0) return false;
  // Single empty text node means no template
  if (children.length === 1 && "text" in children[0] && !children[0].text) {
    return false;
  }
  return true;
}

function replaceTextBindings(text: string, data: Record<string, unknown>): string {
  const keys = Object.keys(data);
  const firstKey = keys[0];

  return text.replace(/\{\{(\w+)\}\}/g, (_, field) => {
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
  node: TemplateNode | TextNode,
  data: Record<string, unknown>
): TemplateNode | TextNode {
  if ("text" in node) {
    return {
      ...node,
      text: replaceTextBindings(node.text, data),
    };
  }

  return {
    ...node,
    children: node.children?.map((child) => replaceBindings(child, data)),
  };
}

function renderNode(node: TemplateNode | TextNode, key: string | number): ReactNode {
  if ("text" in node) {
    let content: ReactNode = node.text;
    if (node.bold) content = <strong>{content}</strong>;
    if (node.italic) content = <em>{content}</em>;
    if (node.underline) content = <u>{content}</u>;
    if (node.strikethrough) content = <s>{content}</s>;
    if (node.code) content = <code className="bg-gray-100 px-1 rounded text-sm">{content}</code>;
    return <span key={key}>{content}</span>;
  }

  const children = node.children?.map((child, i) => renderNode(child, i));

  switch (node.type) {
    case "h1":
      return <h1 key={key} className={node.className ?? "text-3xl font-bold mt-6 mb-2"}>{children}</h1>;
    case "h2":
      return <h2 key={key} className={node.className ?? "text-2xl font-bold mt-5 mb-2"}>{children}</h2>;
    case "h3":
      return <h3 key={key} className={node.className ?? "text-xl font-semibold mt-4 mb-2"}>{children}</h3>;
    case "p":
      return <p key={key} className={node.className ?? "my-1"}>{children}</p>;
    case "ul":
      return <ul key={key} className={node.className ?? "list-disc list-inside my-2"}>{children}</ul>;
    case "ol":
      return <ol key={key} className={node.className ?? "list-decimal list-inside my-2"}>{children}</ol>;
    case "li":
      return <li key={key} className={node.className}>{children}</li>;
    case "lic":
      return <span key={key} className={node.className}>{children}</span>;
    case "div":
      return <div key={key} className={node.className}>{children}</div>;
    case "span":
      return <span key={key} className={node.className}>{children}</span>;
    default:
      return <div key={key} className={node.className}>{children}</div>;
  }
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

async function LiveQueryData({
  query,
  params = [],
  children,
  columns,
}: LiveQueryStaticProps) {
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
    const resolvedColumns = columns === "auto" || !columns
      ? autoDetectColumns(data)
      : columns;
    return renderTable(data, resolvedColumns);
  }

  // Template mode - use children as template
  const isSingleRow = data.length === 1;

  if (isSingleRow) {
    const boundTemplate = template!.map((node) => replaceBindings(node, data[0]));
    return (
      <div className="my-2">
        {boundTemplate.map((node, i) => renderNode(node as TemplateNode, i))}
      </div>
    );
  }

  // Multiple rows: render template for each row
  return (
    <div className="my-2 space-y-1">
      {data.map((row, rowIndex) => {
        // Inject _index for numbered lists
        const rowWithIndex = { ...row, _index: rowIndex + 1 };
        const boundTemplate = template!.map((node) => replaceBindings(node, rowWithIndex));
        return (
          <div key={rowIndex}>
            {boundTemplate.map((node, i) => renderNode(node as TemplateNode, `${rowIndex}-${i}`))}
          </div>
        );
      })}
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
