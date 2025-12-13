/**
 * DataBrowser - High-performance canvas-based data grid
 *
 * Uses Glide Data Grid for efficient rendering of large datasets
 * with native scrolling and cell virtualization.
 * Now uses tRPC for type-safe CRUD operations.
 */

import DataEditor, {
  type EditableGridCell,
  type GridCell,
  GridCellKind,
  type GridColumn,
  type Item,
} from "@glideapps/glide-data-grid";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "@glideapps/glide-data-grid/dist/index.css";
import {
  ArrowLeft,
  ArrowRight,
  CircleNotch,
  FloppyDisk,
  Plus,
  Table as TableIcon,
  Trash,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { type ColumnDefinition, useTableData } from "@/hooks/useTableData";
import { cn } from "@/lib/utils";

interface DataBrowserProps {
  source: string;
  table: string;
  className?: string;
  editable?: boolean;
}

const PAGE_SIZE = 500;

export function DataBrowser({ source, table, className, editable = false }: DataBrowserProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [pendingChanges, setPendingChanges] = useState<Map<string, Record<string, unknown>>>(
    new Map(),
  );
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());

  // Measure container size
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setContainerSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Use tRPC-based table data hook
  const {
    rows,
    columns,
    primaryKeyColumn,
    isLoading,
    isFetching,
    isMutating,
    pagination,
    nextPage,
    prevPage,
    updateRow,
    deleteRow,
    bulkUpdate,
    createRow,
  } = useTableData({
    source,
    table,
    pageSize: PAGE_SIZE,
  });

  // Build columns for glide-data-grid
  const gridColumns = useMemo<GridColumn[]>(() => {
    return columns.map((col) => ({
      id: col.name,
      title: col.name,
      width: getColumnWidth(col),
      grow: 1,
    }));
  }, [columns]);

  // Column name lookup for getCellContent
  const columnNames = useMemo(() => {
    return columns.map((col) => col.name);
  }, [columns]);

  // Get cell content callback - this is called for each visible cell
  const getCellContent = useCallback(
    (cell: Item): GridCell => {
      const [col, row] = cell;

      // Safety check
      if (row >= rows.length || col >= columnNames.length) {
        return {
          kind: GridCellKind.Loading,
          allowOverlay: false,
        };
      }

      const rowData = rows[row];
      const columnName = columnNames[col];
      const columnDef = columns[col];

      // Check for pending changes
      const rowId = String(rowData[primaryKeyColumn]);
      const pending = pendingChanges.get(rowId);
      const value = pending?.[columnName] ?? rowData?.[columnName];

      // Handle null values
      if (value === null || value === undefined) {
        return {
          kind: GridCellKind.Text,
          data: "",
          displayData: "null",
          allowOverlay: editable,
          readonly: !editable,
          style: "faded",
        };
      }

      // Handle boolean values - BooleanCell requires allowOverlay: false
      if (typeof value === "boolean" || columnDef?.type === "boolean") {
        return {
          kind: GridCellKind.Boolean,
          data: Boolean(value),
          allowOverlay: false,
          readonly: !editable,
        };
      }

      // Handle number values
      if (
        typeof value === "number" ||
        columnDef?.type.includes("int") ||
        columnDef?.type.includes("numeric") ||
        columnDef?.type.includes("float") ||
        columnDef?.type.includes("double")
      ) {
        return {
          kind: GridCellKind.Number,
          data: Number(value),
          displayData: String(value),
          allowOverlay: editable,
          readonly: !editable,
        };
      }

      // Handle objects/arrays as JSON
      if (typeof value === "object") {
        const jsonStr = JSON.stringify(value);
        return {
          kind: GridCellKind.Text,
          data: jsonStr,
          displayData: jsonStr,
          allowOverlay: editable,
          readonly: !editable,
        };
      }

      // Default to text
      return {
        kind: GridCellKind.Text,
        data: String(value),
        displayData: String(value),
        allowOverlay: editable,
        readonly: !editable,
      };
    },
    [rows, columnNames, columns, primaryKeyColumn, pendingChanges, editable],
  );

  // Handle cell edits
  const onCellEdited = useCallback(
    (cell: Item, newValue: EditableGridCell) => {
      if (!editable) return;

      const [col, row] = cell;
      const rowData = rows[row];
      const columnName = columnNames[col];
      const rowId = String(rowData[primaryKeyColumn]);

      // Extract value from cell
      let value: unknown;
      if (newValue.kind === GridCellKind.Text) {
        value = newValue.data;
      } else if (newValue.kind === GridCellKind.Number) {
        value = newValue.data;
      } else if (newValue.kind === GridCellKind.Boolean) {
        value = newValue.data;
      }

      // Track pending change
      setPendingChanges((prev) => {
        const next = new Map(prev);
        const existing = next.get(rowId) ?? {};
        next.set(rowId, { ...existing, [columnName]: value });
        return next;
      });
    },
    [editable, rows, columnNames, primaryKeyColumn],
  );

  // Save pending changes
  const handleSaveChanges = useCallback(async () => {
    if (pendingChanges.size === 0) return;

    try {
      const updates = Array.from(pendingChanges.entries()).map(([id, data]) => ({ id, data }));
      await bulkUpdate(updates);
      setPendingChanges(new Map());
      toast.success(`Saved ${updates.length} changes`);
    } catch (error) {
      toast.error(`Failed to save: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }, [pendingChanges, bulkUpdate]);

  // Add new row
  const handleAddRow = useCallback(async () => {
    try {
      // Create empty row with default values
      const newData: Record<string, unknown> = {};
      for (const col of columns) {
        if (col.defaultValue) {
          newData[col.name] = col.defaultValue;
        } else if (!col.nullable && !col.isPrimaryKey) {
          // Set sensible defaults for required fields
          if (col.type.includes("int") || col.type.includes("numeric")) {
            newData[col.name] = 0;
          } else if (col.type === "boolean") {
            newData[col.name] = false;
          } else {
            newData[col.name] = "";
          }
        }
      }
      await createRow(newData);
      toast.success("Row added");
    } catch (error) {
      toast.error(`Failed to add row: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }, [columns, createRow]);

  // Delete selected rows
  const handleDeleteSelected = useCallback(async () => {
    if (selectedRows.size === 0) return;

    try {
      for (const rowIndex of selectedRows) {
        const rowData = rows[rowIndex];
        if (rowData) {
          await deleteRow(String(rowData[primaryKeyColumn]));
        }
      }
      setSelectedRows(new Set());
      toast.success(`Deleted ${selectedRows.size} rows`);
    } catch (error) {
      toast.error(`Failed to delete: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }, [selectedRows, rows, primaryKeyColumn, deleteRow]);

  // Pagination
  const { page, totalPages } = pagination;
  const canPrevPage = page > 0;
  const canNextPage = page < totalPages - 1;

  if (columns.length === 0 && !isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Table not found or has no columns
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Header with table info */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-purple-500/10">
            <TableIcon weight="duotone" className="h-5 w-5 text-purple-500" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">
              {source}.{table}
            </h1>
            <p className="text-sm text-muted-foreground">
              {rows.length.toLocaleString()} rows &middot; {columns.length} columns
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Editing actions */}
          {editable && (
            <>
              <button
                onClick={handleAddRow}
                disabled={isMutating}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                <Plus weight="bold" className="h-4 w-4" />
                Add Row
              </button>
              {selectedRows.size > 0 && (
                <button
                  onClick={handleDeleteSelected}
                  disabled={isMutating}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
                >
                  <Trash weight="bold" className="h-4 w-4" />
                  Delete ({selectedRows.size})
                </button>
              )}
              {pendingChanges.size > 0 && (
                <button
                  onClick={handleSaveChanges}
                  disabled={isMutating}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm rounded-md bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                >
                  <FloppyDisk weight="bold" className="h-4 w-4" />
                  Save ({pendingChanges.size})
                </button>
              )}
            </>
          )}

          {/* Loading indicator */}
          {(isFetching || isMutating) && (
            <CircleNotch weight="bold" className="h-4 w-4 animate-spin text-muted-foreground" />
          )}

          {/* Pagination controls */}
          <span className="text-sm text-muted-foreground tabular-nums">
            Page {page + 1} of {Math.max(1, totalPages)}
          </span>
          <button
            onClick={prevPage}
            disabled={!canPrevPage}
            className={cn(
              "p-1.5 rounded-md transition-colors",
              canPrevPage
                ? "hover:bg-accent text-foreground"
                : "text-muted-foreground/50 cursor-not-allowed",
            )}
          >
            <ArrowLeft weight="bold" className="h-4 w-4" />
          </button>
          <button
            onClick={nextPage}
            disabled={!canNextPage}
            className={cn(
              "p-1.5 rounded-md transition-colors",
              canNextPage
                ? "hover:bg-accent text-foreground"
                : "text-muted-foreground/50 cursor-not-allowed",
            )}
          >
            <ArrowRight weight="bold" className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Data grid */}
      <div ref={containerRef} className="flex-1 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <CircleNotch weight="bold" className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <TableIcon weight="duotone" className="h-12 w-12 mb-3 opacity-50" />
            <p>No data in this table</p>
            {editable && (
              <button
                onClick={handleAddRow}
                className="mt-4 flex items-center gap-1.5 px-3 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <Plus weight="bold" className="h-4 w-4" />
                Add First Row
              </button>
            )}
          </div>
        ) : containerSize.width > 0 && containerSize.height > 0 ? (
          <DataEditor
            columns={gridColumns}
            rows={rows.length}
            getCellContent={getCellContent}
            onCellEdited={editable ? onCellEdited : undefined}
            smoothScrollX
            smoothScrollY
            width={containerSize.width}
            height={containerSize.height}
            rowHeight={32}
            headerHeight={36}
            theme={{
              accentColor: "hsl(var(--primary))",
              accentLight: "hsl(var(--primary) / 0.1)",
              textDark: "hsl(var(--foreground))",
              textMedium: "hsl(var(--muted-foreground))",
              textLight: "hsl(var(--muted-foreground) / 0.7)",
              textBubble: "hsl(var(--foreground))",
              bgIconHeader: "hsl(var(--muted))",
              fgIconHeader: "hsl(var(--muted-foreground))",
              textHeader: "hsl(var(--muted-foreground))",
              textHeaderSelected: "hsl(var(--foreground))",
              bgCell: "hsl(var(--background))",
              bgCellMedium: "hsl(var(--muted) / 0.3)",
              bgHeader: "hsl(var(--muted) / 0.5)",
              bgHeaderHasFocus: "hsl(var(--muted))",
              bgHeaderHovered: "hsl(var(--accent))",
              bgBubble: "hsl(var(--muted))",
              bgBubbleSelected: "hsl(var(--accent))",
              bgSearchResult: "hsl(var(--primary) / 0.2)",
              borderColor: "hsl(var(--border))",
              drilldownBorder: "hsl(var(--border))",
              linkColor: "hsl(var(--primary))",
              cellHorizontalPadding: 8,
              cellVerticalPadding: 4,
              headerFontStyle: "500 13px",
              baseFontStyle: "13px",
              fontFamily: "inherit",
              editorFontSize: "13px",
            }}
          />
        ) : null}
      </div>
    </div>
  );
}

// Helper to determine column width based on type
function getColumnWidth(col: ColumnDefinition): number {
  const type = col.type.toLowerCase();
  if (type === "boolean") return 80;
  if (type.includes("uuid")) return 280;
  if (type.includes("timestamp") || type.includes("date")) return 180;
  if (type.includes("int") || type.includes("numeric")) return 100;
  if (type.includes("text") || type.includes("varchar")) return 200;
  if (type.includes("json")) return 250;
  return 150;
}
