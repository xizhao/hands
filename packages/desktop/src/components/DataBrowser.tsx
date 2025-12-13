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

/**
 * Blend a color with background at given opacity - returns SOLID color
 * Canvas needs solid colors to avoid ghosting artifacts from transparency
 */
function blendWithBackground(colorVar: string, bgVar: string, opacity: number): string {
  // Get computed colors
  const style = getComputedStyle(document.documentElement);
  const colorHsl = style.getPropertyValue(colorVar).trim();
  const bgHsl = style.getPropertyValue(bgVar).trim();

  if (!colorHsl || !bgHsl) return "#000";

  // Parse HSL values (format: "H S% L%")
  const parseHsl = (hsl: string) => {
    const parts = hsl.split(/\s+/);
    return {
      h: parseFloat(parts[0]) || 0,
      s: parseFloat(parts[1]) || 0,
      l: parseFloat(parts[2]) || 0,
    };
  };

  const color = parseHsl(colorHsl);
  const bg = parseHsl(bgHsl);

  // Blend lightness (simplified blend - works well for most cases)
  const blendedL = bg.l + (color.l - bg.l) * opacity;
  // For saturation, reduce it towards background
  const blendedS = bg.s + (color.s - bg.s) * opacity;
  // Keep hue from the color
  const blendedH = color.h;

  return `hsl(${blendedH} ${blendedS}% ${blendedL}%)`;
}

import {
  ArrowDown,
  ArrowUp,
  ArrowsDownUp,
  Broadcast,
  CircleNotch,
  DotsThreeVertical,
  FloppyDisk,
  Funnel,
  Plus,
  Table as TableIcon,
  Trash,
  X,
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

export function DataBrowser({ source, table, className, editable = false }: DataBrowserProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState<{ width: number; height: number } | null>(
    null,
  );
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
  // Column width overrides (for resize)
  const [columnWidths, setColumnWidths] = useState<Map<string, number>>(new Map());
  // Sorting state
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  // Column order for reordering (stores column indices in display order)
  const [columnOrder, setColumnOrder] = useState<number[] | null>(null);
  // Header menu state
  const [menuColumnIndex, setMenuColumnIndex] = useState<number | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);

  // Measure container size - use layout effect to measure before paint
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Initial measurement
    const rect = container.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      setContainerSize({ width: rect.width, height: rect.height });
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry && entry.contentRect.width > 0 && entry.contentRect.height > 0) {
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
    sort: sortColumn ?? undefined,
    sortDirection,
  });

  // Reset state when table changes (fixes ghost trails)
  useEffect(() => {
    setGridSelection({ columns: CompactSelection.empty(), rows: CompactSelection.empty() });
    setSelectedIds(new Set());
    setPendingChanges(new Map());
    setColumnWidths(new Map());
    setSortColumn(null);
    setSortDirection("asc");
    setColumnOrder(null); // Reset column order to default
    setMenuColumnIndex(null);
    setMenuPosition(null);
  }, [source, table]);

  // Apply column order (for reordering) and build ordered columns list
  const orderedColumns = useMemo(() => {
    if (!columnOrder) return columns;
    // Map order indices back to columns, filtering out invalid indices
    return columnOrder
      .filter((i) => i >= 0 && i < columns.length)
      .map((i) => columns[i]);
  }, [columns, columnOrder]);

  // Build columns for glide-data-grid with resize and reorder support
  // Clean column headers with menu for sort/filter/subscribe
  const gridColumns = useMemo<GridColumn[]>(() => {
    return orderedColumns.map((col) => {
      const isSorted = sortColumn === col.name;
      const sortIndicator = isSorted ? (sortDirection === "asc" ? " ↑" : " ↓") : "";
      return {
        id: col.name,
        title: col.name + sortIndicator,
        width: columnWidths.get(col.name) ?? getColumnWidth(col),
        hasMenu: true, // Show menu dropdown (sort/filter/subscribe)
      };
    });
  }, [orderedColumns, columnWidths, sortColumn, sortDirection]);

  // Column name lookup for getCellContent (respects column order)
  const columnNames = useMemo(() => {
    return orderedColumns.map((col) => col.name);
  }, [orderedColumns]);

  // Compute theme from CSS variables at runtime (recompute when themeVersion changes)
  // IMPORTANT: Use SOLID colors only - transparent/alpha colors cause ghosting on canvas
  // Styled to match Google Sheets / modern Excel aesthetic
  // biome-ignore lint/correctness/useExhaustiveDependencies: themeVersion triggers recompute on theme change
  const gridTheme = useMemo<Partial<Theme>>(() => {
    // Only compute on client side
    if (typeof window === "undefined") return {};
    return {
      // Selection - subtle blue highlight like Google Sheets
      accentColor: getCssVar("--primary"),
      accentFg: getCssVar("--primary-foreground"),
      // Very subtle selection background
      accentLight: blendWithBackground("--primary", "--background", 0.08),

      // Text colors - clean, readable
      textDark: getCssVar("--foreground"),
      textMedium: getCssVar("--muted-foreground"),
      textLight: blendWithBackground("--muted-foreground", "--background", 0.5),
      textBubble: getCssVar("--foreground"),

      // Header styling - subtle normally, prominent when selected
      bgIconHeader: getCssVar("--background"),
      fgIconHeader: getCssVar("--muted-foreground"),
      textHeader: getCssVar("--muted-foreground"),
      textHeaderSelected: getCssVar("--primary"), // Blue text when column selected

      // Cell backgrounds - clean white/dark based on theme
      bgCell: getCssVar("--background"),
      bgCellMedium: getCssVar("--background"),

      // Header backgrounds - very subtle, almost same as cells
      bgHeader: blendWithBackground("--muted", "--background", 0.3),
      bgHeaderHasFocus: blendWithBackground("--primary", "--background", 0.08),
      bgHeaderHovered: blendWithBackground("--muted", "--background", 0.5),

      // Bubbles (tags/chips)
      bgBubble: getCssVar("--muted"),
      bgBubbleSelected: blendWithBackground("--primary", "--background", 0.15),

      // Search highlighting
      bgSearchResult: blendWithBackground("--primary", "--background", 0.2),

      // Borders - subtle gridlines like spreadsheets
      borderColor: blendWithBackground("--border", "--background", 0.5),
      drilldownBorder: getCssVar("--border"),
      linkColor: getCssVar("--primary"),

      // Typography - clean system fonts
      cellHorizontalPadding: 8,
      cellVerticalPadding: 3,
      headerFontStyle: "500 12px", // Lighter weight header
      baseFontStyle: "13px",
      fontFamily:
        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
      editorFontSize: "13px",

      // Line height for compact rows
      lineHeight: 1.4,
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

  // Handle column resize
  const onColumnResize = useCallback(
    (column: GridColumn, newSize: number) => {
      setColumnWidths((prev) => {
        const next = new Map(prev);
        next.set(column.id as string, newSize);
        return next;
      });
    },
    [],
  );

  // Handle header menu click (for sort/filter dropdown)
  const onHeaderMenuClick = useCallback(
    (col: number, bounds: Rectangle) => {
      const columnName = columnNames[col];
      if (!columnName) return;

      // Set menu position based on header bounds
      setMenuColumnIndex(col);
      setMenuPosition({
        x: bounds.x + bounds.width - 10,
        y: bounds.y + bounds.height,
      });
    },
    [columnNames],
  );

  // Close menu when clicking outside
  const closeMenu = useCallback(() => {
    setMenuColumnIndex(null);
    setMenuPosition(null);
  }, []);

  // Sort handlers for menu
  const handleSortAsc = useCallback(() => {
    if (menuColumnIndex === null) return;
    const columnName = columnNames[menuColumnIndex];
    if (columnName) {
      setSortColumn(columnName);
      setSortDirection("asc");
    }
    closeMenu();
  }, [menuColumnIndex, columnNames, closeMenu]);

  const handleSortDesc = useCallback(() => {
    if (menuColumnIndex === null) return;
    const columnName = columnNames[menuColumnIndex];
    if (columnName) {
      setSortColumn(columnName);
      setSortDirection("desc");
    }
    closeMenu();
  }, [menuColumnIndex, columnNames, closeMenu]);

  const handleClearSort = useCallback(() => {
    setSortColumn(null);
    setSortDirection("asc");
    closeMenu();
  }, [closeMenu]);

  // Handle column reordering via drag-and-drop
  const onColumnMoved = useCallback(
    (startIndex: number, endIndex: number) => {
      setColumnOrder((prevOrder) => {
        // Initialize order if null (first reorder)
        const currentOrder = prevOrder ?? columns.map((_, i) => i);
        const newOrder = [...currentOrder];
        // Remove the column from its old position
        const [moved] = newOrder.splice(startIndex, 1);
        // Insert it at the new position
        newOrder.splice(endIndex, 0, moved);
        return newOrder;
      });
    },
    [columns],
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
      {/* Minimal toolbar - Google Sheets style */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-background">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <TableIcon weight="fill" className="h-4 w-4 text-primary/70" />
          <span className="font-medium text-foreground">{table}</span>
          <span className="text-xs">
            {totalRows.toLocaleString()} rows
            {loadedCount < totalRows && ` (${loadedCount.toLocaleString()} loaded)`}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Editing actions - minimal buttons */}
          {editable && (
            <>
              <button
                type="button"
                onClick={handleAddRow}
                disabled={isMutating}
                className="flex items-center gap-1 px-2 py-1 text-xs rounded hover:bg-muted disabled:opacity-50"
                title="Add row"
              >
                <Plus weight="bold" className="h-3.5 w-3.5" />
              </button>
              {selectedIds.size > 0 && (
                <button
                  type="button"
                  onClick={handleDeleteSelected}
                  disabled={isMutating}
                  className="flex items-center gap-1 px-2 py-1 text-xs rounded text-destructive hover:bg-destructive/10 disabled:opacity-50"
                  title={`Delete ${selectedIds.size} selected`}
                >
                  <Trash weight="bold" className="h-3.5 w-3.5" />
                </button>
              )}
              {pendingChanges.size > 0 && (
                <button
                  type="button"
                  onClick={handleSaveChanges}
                  disabled={isMutating}
                  className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  <FloppyDisk weight="bold" className="h-3.5 w-3.5" />
                  <span>Save ({pendingChanges.size})</span>
                </button>
              )}
            </>
          )}

          {/* Loading indicator */}
          {(isFetching || isMutating) && (
            <CircleNotch weight="bold" className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
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
        ) : !containerSize ? (
          // Wait for container to be measured before rendering grid (prevents blurry first render)
          <div className="flex items-center justify-center h-full">
            <CircleNotch weight="bold" className="h-6 w-6 animate-spin text-muted-foreground/50" />
          </div>
        ) : (
          <>
            <DataEditor
              key={`${source}/${table}`} // Force remount on table change (fixes ghost trails)
              columns={gridColumns}
              rows={totalRows}
              getCellContent={getCellContent}
              getCellsForSelection={true}
              // Editing - double-click or Enter opens editor, Escape/Enter commits
              onCellEdited={editable ? onCellEdited : undefined}
              // Scrolling and visibility
              onVisibleRegionChanged={onVisibleRegionChanged}
              // Selection
              gridSelection={gridSelection}
              onGridSelectionChange={onGridSelectionChange}
              rowSelectionMode="multi"
              rangeSelect="rect" // Single rect like spreadsheets
              columnSelect="single" // Click header to select column
              // Column interactions
              onColumnResize={onColumnResize}
              onColumnMoved={onColumnMoved}
              onHeaderMenuClick={onHeaderMenuClick}
              // Smooth scrolling like Google Sheets
              smoothScrollX
              smoothScrollY
              // Sizing
              scaleToRem
              width={containerSize.width}
              height={containerSize.height}
              rowHeight={28} // Compact like spreadsheets
              headerHeight={32} // Slightly taller header
              // Theme
              theme={gridTheme}
              // Row markers - minimal, just for selection
              rowMarkers="clickable-number"
            />
            {/* Column header menu dropdown */}
            {menuPosition && menuColumnIndex !== null && (
              <div
                className="fixed z-50"
                style={{ left: menuPosition.x, top: menuPosition.y }}
              >
                <div
                  className="absolute inset-0 fixed"
                  onClick={closeMenu}
                  onKeyDown={(e) => e.key === "Escape" && closeMenu()}
                />
                <div className="relative bg-popover border rounded-md shadow-lg py-1 min-w-[180px]">
                  {/* Sort */}
                  <div className="px-3 py-1.5">
                    <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-1">
                      <ArrowsDownUp weight="bold" className="h-3.5 w-3.5" />
                      Sort
                    </div>
                    <div className="flex gap-1 ml-5">
                      <button
                        type="button"
                        onClick={handleSortAsc}
                        className={cn(
                          "flex items-center gap-1 px-2 py-1 text-xs rounded hover:bg-accent",
                          sortColumn === columnNames[menuColumnIndex] &&
                            sortDirection === "asc" &&
                            "bg-accent text-primary"
                        )}
                      >
                        <ArrowUp weight="bold" className="h-3 w-3" />
                        Asc
                      </button>
                      <button
                        type="button"
                        onClick={handleSortDesc}
                        className={cn(
                          "flex items-center gap-1 px-2 py-1 text-xs rounded hover:bg-accent",
                          sortColumn === columnNames[menuColumnIndex] &&
                            sortDirection === "desc" &&
                            "bg-accent text-primary"
                        )}
                      >
                        <ArrowDown weight="bold" className="h-3 w-3" />
                        Desc
                      </button>
                      {sortColumn === columnNames[menuColumnIndex] && (
                        <button
                          type="button"
                          onClick={handleClearSort}
                          className="flex items-center gap-1 px-2 py-1 text-xs rounded hover:bg-accent text-muted-foreground"
                        >
                          <X weight="bold" className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="border-t my-1" />

                  {/* Filter */}
                  <button
                    type="button"
                    onClick={closeMenu}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent"
                  >
                    <Funnel weight="bold" className="h-4 w-4" />
                    Filter
                  </button>

                  <div className="border-t my-1" />

                  {/* Subscribe (ElectricSQL shape) */}
                  <button
                    type="button"
                    onClick={closeMenu}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent"
                  >
                    <Broadcast weight="fill" className="h-4 w-4 text-purple-500" />
                    <span>Subscribe</span>
                    <span className="ml-auto text-xs text-purple-500/70">shape</span>
                  </button>
                </div>
              </div>
            )}
          </>
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
