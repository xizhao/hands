/**
 * Table Block - Displays tabular data with formatting
 */
import * as React from "react";

export interface TableBlockProps {
  columns: Array<{
    key: string;
    label?: string;
    format?: "text" | "number" | "date" | "currency";
  }>;
  data: Record<string, unknown>[];
  title?: string;
  pageSize?: number;
}

export function TableBlock({
  columns,
  data,
  title,
  pageSize = 50,
}: TableBlockProps) {
  if (!data || data.length === 0) {
    return (
      <div className="p-4 rounded-lg border border-border bg-muted/50">
        <p className="text-muted-foreground text-sm">No data</p>
      </div>
    );
  }

  const displayData = data.slice(0, pageSize);

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      {title && (
        <div className="px-4 py-2 bg-muted/50 border-b border-border">
          <h3 className="text-sm font-medium">{title}</h3>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="px-4 py-2 text-left font-medium text-muted-foreground border-b border-border"
                >
                  {col.label || col.key}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayData.map((row, i) => (
              <tr
                key={i}
                className="border-b border-border last:border-b-0 hover:bg-muted/30 transition-colors"
              >
                {columns.map((col) => (
                  <td key={col.key} className="px-4 py-2">
                    {formatCell(row[col.key], col.format)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.length > pageSize && (
        <div className="px-4 py-2 bg-muted/30 border-t border-border text-xs text-muted-foreground">
          Showing {pageSize} of {data.length} rows
        </div>
      )}
    </div>
  );
}

function formatCell(
  value: unknown,
  format?: "text" | "number" | "date" | "currency"
): string {
  if (value === null || value === undefined) return "-";

  switch (format) {
    case "number":
      return typeof value === "number"
        ? value.toLocaleString()
        : String(value);
    case "currency":
      return typeof value === "number"
        ? `$${value.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
        : String(value);
    case "date":
      if (value instanceof Date) {
        return value.toLocaleDateString();
      }
      if (typeof value === "string" || typeof value === "number") {
        const date = new Date(value);
        return isNaN(date.getTime()) ? String(value) : date.toLocaleDateString();
      }
      return String(value);
    default:
      if (typeof value === "object") return JSON.stringify(value);
      return String(value);
  }
}
