/** @jsxImportSource react */
import * as React from "react";
import { cn } from "@/lib/utils";

export interface DataTableColumn<T> {
  key: keyof T | string;
  header: string;
  render?: (value: unknown, row: T) => React.ReactNode;
  align?: "left" | "center" | "right";
  width?: string;
}

export interface DataTableProps<T extends Record<string, unknown>> {
  data: T[];
  columns: DataTableColumn<T>[];
  className?: string;
  emptyMessage?: string;
}

export function DataTable<T extends Record<string, unknown>>({
  data,
  columns,
  className,
  emptyMessage = "No data available",
}: DataTableProps<T>) {
  const getValue = (row: T, key: string): unknown => {
    const keys = key.split(".");
    let value: unknown = row;
    for (const k of keys) {
      if (value && typeof value === "object" && k in value) {
        value = (value as Record<string, unknown>)[k];
      } else {
        return undefined;
      }
    }
    return value;
  };

  return (
    <div className={cn("w-full overflow-auto", className)}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            {columns.map((col) => (
              <th
                key={String(col.key)}
                className={cn(
                  "px-4 py-3 font-medium text-muted-foreground",
                  col.align === "center" && "text-center",
                  col.align === "right" && "text-right",
                  !col.align && "text-left"
                )}
                style={{ width: col.width }}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-8 text-center text-muted-foreground"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((row, i) => (
              <tr key={i} className="border-b last:border-0 hover:bg-muted/50">
                {columns.map((col) => {
                  const value = getValue(row, String(col.key));
                  return (
                    <td
                      key={String(col.key)}
                      className={cn(
                        "px-4 py-3",
                        col.align === "center" && "text-center",
                        col.align === "right" && "text-right"
                      )}
                    >
                      {col.render ? col.render(value, row) : String(value ?? "")}
                    </td>
                  );
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
