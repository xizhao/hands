/**
 * DataBrowser - High-performance canvas-based data grid
 *
 * Uses Glide Data Grid for efficient rendering of large datasets
 * with native scrolling and cell virtualization.
 * Supports infinite scroll with sparse data caching and ID-based selections.
 */

import DataEditor, {
  CompactSelection,
  type EditableGridCell,
  type GridCell,
  GridCellKind,
  type GridColumn,
  type GridSelection,
  type Item,
  type Rectangle,
  type Theme,
} from "@glideapps/glide-data-grid";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "@glideapps/glide-data-grid/dist/index.css";

/** Convert CSS variable HSL value to actual hsl() string */
function getCssVar(name: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!value) return "#000";
  // CSS vars are stored as "0 0% 100%" format, convert to "hsl(0 0% 100%)"
  return `hsl(${value})`;
}

/** Convert CSS variable HSL value to hsl() string with opacity */
function getCssVarWithAlpha(name: string, alpha: number): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!value) return "#000";
  return `hsl(${value} / ${alpha})`;
}

import { CircleNotch, FloppyDisk, Plus, Table as TableIcon, Trash } from "@phosphor-icons/react";
import { toast } from "sonner";
import { type ColumnDefinition, useTableData } from "@/hooks/useTableData";
import { cn } from "@/lib/utils";

interface DataBrowserProps {
  source: string;
  table: string;
  className?: string;
  editable?: boolean;
}

export function DataBrowser({ source, table, className, editable = false }: DataBrowserProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [pendingChanges, setPendingChanges] = useState<Map<string, Record<string, unknown>>>(
    new Map(),
  );
  // Grid-controlled selection state (tracks current UI selection)
  const [gridSelection, setGridSelection] = useState<GridSelection>({
    columns: CompactSelection.empty(),
    rows: CompactSelection.empty(),
  });
  // ID-based selection that persists across pagination
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // Theme version to force re-render on theme change
  const [themeVersion, setThemeVersion] = useState(0);

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

  // Watch for theme changes (class changes on documentElement)
  useEffect(() => {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.attributeName === "class") {
          // Bump theme version to force theme recalculation
          setThemeVersion((v) => v + 1);
        }
      }
    });

    observer.observe(document.documentElement, { attributes: true });
    return () => observer.disconnect();
  }, []);

  // Use tRPC-based table data hook with infinite scroll
  const {
    getRow,
    isRowLoaded: _isRowLoaded,
    loadRange,
    totalRows,
    loadedCount,
    columns,
    primaryKeyColumn: _primaryKeyColumn,
    getRowId,
    isLoading,
    isFetching,
    isMutating,
    deleteRow: _deleteRow,
    bulkUpdate,
    bulkDelete,
    createRow,
  } = useTableData({
    source,
    table,
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

  // Compute theme from CSS variables at runtime (recompute when themeVersion changes)
  // biome-ignore lint/correctness/useExhaustiveDependencies: themeVersion triggers recompute on theme change
  const gridTheme = useMemo<Partial<Theme>>(() => {
    // Only compute on client side
    if (typeof window === "undefined") return {};
    return {
      accentColor: getCssVar("--primary"),
      accentLight: getCssVarWithAlpha("--primary", 0.1),
      textDark: getCssVar("--foreground"),
      textMedium: getCssVar("--muted-foreground"),
      textLight: getCssVarWithAlpha("--muted-foreground", 0.7),
      textBubble: getCssVar("--foreground"),
      bgIconHeader: getCssVar("--muted"),
      fgIconHeader: getCssVar("--muted-foreground"),
      textHeader: getCssVar("--muted-foreground"),
      textHeaderSelected: getCssVar("--foreground"),
      bgCell: getCssVar("--background"),
      bgCellMedium: getCssVarWithAlpha("--muted", 0.3),
      bgHeader: getCssVarWithAlpha("--muted", 0.5),
      bgHeaderHasFocus: getCssVar("--muted"),
      bgHeaderHovered: getCssVar("--accent"),
      bgBubble: getCssVar("--muted"),
      bgBubbleSelected: getCssVar("--accent"),
      bgSearchResult: getCssVarWithAlpha("--primary", 0.2),
      borderColor: getCssVar("--border"),
      drilldownBorder: getCssVar("--border"),
      linkColor: getCssVar("--primary"),
      cellHorizontalPadding: 8,
      cellVerticalPadding: 4,
      headerFontStyle: "500 13px",
      baseFontStyle: "13px",
      fontFamily:
        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
      editorFontSize: "13px",
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [themeVersion]);

  // Handle visible region changes for infinite scroll
  const onVisibleRegionChanged = useCallback(
    (range: Rectangle) => {
      // Load data for visible range with some buffer
      const buffer = 50;
      const startRow = Math.max(0, range.y - buffer);
      const endRow = Math.min(totalRows, range.y + range.height + buffer);
      loadRange(startRow, endRow);
    },
    [loadRange, totalRows],
  );

  // Get cell content callback - this is called for each visible cell
  const getCellContent = useCallback(
    (cell: Item): GridCell => {
      const [col, row] = cell;

      // Safety check for column
      if (col >= columnNames.length) {
        return {
          kind: GridCellKind.Loading,
          allowOverlay: false,
        };
      }

      // Get row from sparse cache
      const rowData = getRow(row);

      // If row is not loaded yet, show loading state
      if (!rowData) {
        return {
          kind: GridCellKind.Loading,
          allowOverlay: false,
        };
      }

      const columnName = columnNames[col];
      const columnDef = columns[col];

      // Check for pending changes
      const rowId = getRowId(rowData);
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
    [getRow, getRowId, columnNames, columns, pendingChanges, editable],
  );

  // Handle cell edits
  const onCellEdited = useCallback(
    (cell: Item, newValue: EditableGridCell) => {
      if (!editable) return;

      const [col, row] = cell;
      const rowData = getRow(row);
      if (!rowData) return;

      const columnName = columnNames[col];
      const rowId = getRowId(rowData);

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
    [editable, getRow, getRowId, columnNames],
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

  // Delete selected rows (using ID-based selection)
  const handleDeleteSelected = useCallback(async () => {
    if (selectedIds.size === 0) return;

    try {
      const ids = Array.from(selectedIds);
      await bulkDelete(ids);
      setSelectedIds(new Set());
      toast.success(`Deleted ${ids.length} rows`);
    } catch (error) {
      toast.error(`Failed to delete: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }, [selectedIds, bulkDelete]);

  // Handle grid selection changes - update both grid state and ID-based tracking
  const onGridSelectionChange = useCallback(
    (selection: GridSelection) => {
      // Update grid selection state (controls visual selection)
      setGridSelection(selection);

      // Also track IDs for persistence across pagination
      const newIds = new Set<string>();
      if (selection.rows) {
        for (const rowIndex of selection.rows) {
          const row = getRow(rowIndex);
          if (row) {
            newIds.add(getRowId(row));
          }
        }
      }
      setSelectedIds(newIds);
    },
    [getRow, getRowId],
  );

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
              {totalRows.toLocaleString()} rows &middot; {columns.length} columns
              {loadedCount < totalRows && (
                <span className="ml-1 text-muted-foreground/60">
                  ({loadedCount.toLocaleString()} loaded)
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Editing actions */}
          {editable && (
            <>
              <button
                type="button"
                onClick={handleAddRow}
                disabled={isMutating}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                <Plus weight="bold" className="h-4 w-4" />
                Add Row
              </button>
              {selectedIds.size > 0 && (
                <button
                  type="button"
                  onClick={handleDeleteSelected}
                  disabled={isMutating}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
                >
                  <Trash weight="bold" className="h-4 w-4" />
                  Delete ({selectedIds.size})
                </button>
              )}
              {pendingChanges.size > 0 && (
                <button
                  type="button"
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
        </div>
      </div>

      {/* Data grid */}
      <div ref={containerRef} className="flex-1 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <CircleNotch weight="bold" className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : totalRows === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <TableIcon weight="duotone" className="h-12 w-12 mb-3 opacity-50" />
            <p>No data in this table</p>
            {editable && (
              <button
                type="button"
                onClick={handleAddRow}
                className="mt-4 flex items-center gap-1.5 px-3 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <Plus weight="bold" className="h-4 w-4" />
                Add First Row
              </button>
            )}
          </div>
        ) : (
          <DataEditor
            columns={gridColumns}
            rows={totalRows}
            getCellContent={getCellContent}
            getCellsForSelection={true}
            onCellEdited={editable ? onCellEdited : undefined}
            onVisibleRegionChanged={onVisibleRegionChanged}
            gridSelection={gridSelection}
            onGridSelectionChange={onGridSelectionChange}
            rowSelectionMode="multi"
            rangeSelect="multi-rect"
            columnSelect="multi"
            smoothScrollX
            smoothScrollY
            scaleToRem
            width={containerSize.width || 100}
            height={containerSize.height || 100}
            rowHeight={32}
            headerHeight={36}
            theme={gridTheme}
          />
        )}
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
