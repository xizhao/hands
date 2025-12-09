/** @jsxImportSource react */
/**
 * SQL Block - Displays query results in a formatted view
 */
import * as React from "react";

export interface SqlBlockProps {
  query: string;
  data?: Record<string, unknown>[];
  error?: string;
  title?: string;
}

export function SqlBlock({ query, data, error, title }: SqlBlockProps) {
  if (error) {
    return (
      <div className="p-4 rounded-lg border border-red-200 bg-red-50 dark:bg-red-950 dark:border-red-800">
        <div className="flex items-start gap-2">
          <span className="text-red-500">Error:</span>
          <span className="text-red-700 dark:text-red-300 text-sm font-mono">
            {error}
          </span>
        </div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="p-4 rounded-lg border border-border bg-muted/50">
        <p className="text-muted-foreground text-sm">No results</p>
        {query && (
          <pre className="mt-2 text-xs text-muted-foreground bg-muted p-2 rounded overflow-x-auto">
            {query}
          </pre>
        )}
      </div>
    );
  }

  const columns = Object.keys(data[0]);

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
                  key={col}
                  className="px-4 py-2 text-left font-medium text-muted-foreground border-b border-border"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.slice(0, 100).map((row, i) => (
              <tr
                key={i}
                className="border-b border-border last:border-b-0 hover:bg-muted/30 transition-colors"
              >
                {columns.map((col) => (
                  <td key={col} className="px-4 py-2 font-mono text-xs">
                    {formatValue(row[col])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.length > 100 && (
        <div className="px-4 py-2 bg-muted/30 border-t border-border text-xs text-muted-foreground">
          Showing 100 of {data.length} rows
        </div>
      )}
    </div>
  );
}

function formatValue(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}
