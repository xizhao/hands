/**
 * TablePreview - LiveValue-style table preview popover
 *
 * Shows table schema and sample data in a popover/modal.
 * Used in the action editor to preview tables referenced in SQL.
 */

import { Database, Table as TableIcon, X } from "@phosphor-icons/react";
import { useState, useEffect, useCallback } from "react";
import { cn } from "../lib/utils";

export interface TableSchema {
  name: string;
  columns: Array<{
    name: string;
    type: string;
    nullable?: boolean;
    primaryKey?: boolean;
  }>;
}

export interface TablePreviewData {
  schema: TableSchema;
  rows: Record<string, unknown>[];
  totalRows?: number;
}

export interface TablePreviewProps {
  /** Table name to preview */
  table: string;
  /** Function to fetch table data */
  fetchTableData?: (table: string) => Promise<TablePreviewData | null>;
  /** Trigger element (the table node) */
  children: React.ReactNode;
  /** Additional class name */
  className?: string;
}

/**
 * Popover-based table preview
 */
export function TablePreview({
  table,
  fetchTableData,
  children,
  className,
}: TablePreviewProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [data, setData] = useState<TablePreviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!fetchTableData) return;

    setLoading(true);
    setError(null);

    try {
      const result = await fetchTableData(table);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load table data");
    } finally {
      setLoading(false);
    }
  }, [table, fetchTableData]);

  useEffect(() => {
    if (isOpen && !data && !loading) {
      loadData();
    }
  }, [isOpen, data, loading, loadData]);

  return (
    <div className={cn("relative inline-block", className)}>
      <div
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={() => setIsOpen(false)}
        onClick={() => setIsOpen(!isOpen)}
      >
        {children}
      </div>

      {isOpen && (
        <div
          className="absolute z-50 left-full ml-2 top-0 w-80 max-h-96 overflow-hidden rounded-lg border border-border bg-popover shadow-lg animate-in fade-in-0 zoom-in-95"
          onMouseEnter={() => setIsOpen(true)}
          onMouseLeave={() => setIsOpen(false)}
        >
          <TablePreviewContent
            table={table}
            data={data}
            loading={loading}
            error={error}
            onClose={() => setIsOpen(false)}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Modal-based table preview (for mobile or expanded view)
 */
export function TablePreviewModal({
  table,
  data,
  loading,
  error,
  isOpen,
  onClose,
}: {
  table: string;
  data: TablePreviewData | null;
  loading: boolean;
  error: string | null;
  isOpen: boolean;
  onClose: () => void;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-2xl max-h-[80vh] overflow-hidden rounded-lg border border-border bg-popover shadow-xl">
        <TablePreviewContent
          table={table}
          data={data}
          loading={loading}
          error={error}
          onClose={onClose}
          expanded
        />
      </div>
    </div>
  );
}

/**
 * Shared content component for table preview
 */
function TablePreviewContent({
  table,
  data,
  loading,
  error,
  onClose,
  expanded = false,
}: {
  table: string;
  data: TablePreviewData | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  expanded?: boolean;
}) {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <TableIcon weight="duotone" className="h-4 w-4 text-primary" />
          <span className="font-mono text-sm font-medium">{table}</span>
          {data?.totalRows !== undefined && (
            <span className="text-xs text-muted-foreground">
              ({data.totalRows.toLocaleString()} rows)
            </span>
          )}
        </div>
        {expanded && (
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-accent transition-colors"
          >
            <X weight="bold" className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {loading && (
          <div className="flex items-center justify-center p-8 text-muted-foreground">
            <div className="animate-pulse">Loading...</div>
          </div>
        )}

        {error && (
          <div className="p-4 text-sm text-destructive">
            {error}
          </div>
        )}

        {!loading && !error && !data && (
          <div className="flex flex-col items-center justify-center p-8 text-muted-foreground">
            <Database weight="duotone" className="h-8 w-8 mb-2 opacity-50" />
            <p className="text-sm">No preview available</p>
          </div>
        )}

        {data && (
          <div className="divide-y divide-border">
            {/* Schema */}
            <div className="p-3">
              <p className="text-xs font-medium text-muted-foreground mb-2">Schema</p>
              <div className="flex flex-wrap gap-1">
                {data.schema.columns.map((col) => (
                  <span
                    key={col.name}
                    className={cn(
                      "inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono",
                      col.primaryKey
                        ? "bg-primary/10 text-primary border border-primary/20"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {col.name}
                    <span className="opacity-60">{col.type}</span>
                    {col.nullable && <span className="opacity-40">?</span>}
                  </span>
                ))}
              </div>
            </div>

            {/* Sample Data */}
            {data.rows.length > 0 && (
              <div className="p-3">
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  Sample Data ({data.rows.length} rows)
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border">
                        {data.schema.columns.slice(0, 5).map((col) => (
                          <th
                            key={col.name}
                            className="text-left font-medium text-muted-foreground p-1.5"
                          >
                            {col.name}
                          </th>
                        ))}
                        {data.schema.columns.length > 5 && (
                          <th className="text-left font-medium text-muted-foreground p-1.5">
                            ...
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {data.rows.slice(0, 5).map((row, i) => (
                        <tr key={i} className="border-b border-border/50">
                          {data.schema.columns.slice(0, 5).map((col) => (
                            <td
                              key={col.name}
                              className="p-1.5 font-mono truncate max-w-[120px]"
                            >
                              {formatValue(row[col.name])}
                            </td>
                          ))}
                          {data.schema.columns.length > 5 && (
                            <td className="p-1.5 text-muted-foreground">...</td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Format a cell value for display
 */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "null";
  }
  if (typeof value === "object") {
    return JSON.stringify(value).slice(0, 50);
  }
  if (typeof value === "string" && value.length > 50) {
    return value.slice(0, 47) + "...";
  }
  return String(value);
}

/**
 * Hook to fetch table preview data
 */
export function useTablePreview(
  table: string,
  runtimePort: number | null
): {
  data: TablePreviewData | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
} {
  const [data, setData] = useState<TablePreviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!runtimePort || !table) return;

    setLoading(true);
    setError(null);

    try {
      // Fetch schema for all tables
      const schemaRes = await fetch(
        `http://localhost:${runtimePort}/db/schema`
      );

      if (!schemaRes.ok) {
        throw new Error("Failed to fetch schema");
      }

      const schemaJson = await schemaRes.json();
      const tableSchema = schemaJson.tables?.find(
        (t: { name: string }) => t.name.toLowerCase() === table.toLowerCase()
      );

      // Fetch sample rows
      const rowsRes = await fetch(
        `http://localhost:${runtimePort}/db/query`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sql: `SELECT * FROM "${table}" LIMIT 5` }),
        }
      );

      let rows: Record<string, unknown>[] = [];
      if (rowsRes.ok) {
        const rowsJson = await rowsRes.json();
        rows = rowsJson.rows ?? [];
      }

      // Fetch total count
      const countRes = await fetch(
        `http://localhost:${runtimePort}/db/query`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sql: `SELECT COUNT(*) as count FROM "${table}"` }),
        }
      );

      let totalRows: number | undefined;
      if (countRes.ok) {
        const countJson = await countRes.json();
        totalRows = countJson.rows?.[0]?.count;
      }

      setData({
        schema: {
          name: table,
          columns: tableSchema?.columns?.map((c: { name: string; type: string; isPrimary?: boolean; nullable?: boolean }) => ({
            name: c.name,
            type: c.type,
            primaryKey: c.isPrimary,
            nullable: c.nullable,
          })) ?? [],
        },
        rows,
        totalRows,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load table data");
    } finally {
      setLoading(false);
    }
  }, [table, runtimePort]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}
