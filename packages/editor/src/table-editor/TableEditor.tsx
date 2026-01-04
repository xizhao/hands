/**
 * TableEditor - High-performance canvas-based data grid
 *
 * Uses Glide Data Grid for efficient rendering of large datasets
 * with native scrolling and cell virtualization.
 * Supports infinite scroll with sparse data caching and ID-based selections.
 *
 * Features:
 * - Cell editing → UPDATE SQL
 * - Row add/delete → INSERT/DELETE SQL
 * - Column operations → ALTER TABLE SQL
 * - SQL preview before save
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

import {
  ArrowDown,
  ArrowsDownUp,
  ArrowUp,
  Broadcast,
  CaretRight,
  CircleNotch,
  Code,
  Eye,
  FloppyDisk,
  Funnel,
  PencilSimple,
  Plus,
  Table as TableIcon,
  Trash,
  X,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { cn } from "../lib/utils";
import {
  generateAddColumnSql,
  generateAlterColumnTypeSql,
  generateDropColumnSql,
  generateRenameColumnSql,
  generateUpdateSql,
} from "../sql";
import type { PendingChange, TableEditorProps } from "./types";
import { blendWithBackground, getColumnWidth, getCssVar } from "./utils";

// Common SQL types for dropdown
const SQL_TYPES = [
  "TEXT",
  "INTEGER",
  "REAL",
  "BOOLEAN",
  "TIMESTAMP",
  "DATE",
  "JSON",
  "UUID",
  "VARCHAR(255)",
  "NUMERIC",
];

export function TableEditor({
  dataProvider,
  tableName,
  className,
  editable = false,
  onSortChange,
}: TableEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState<{
    width: number;
    height: number;
  } | null>(null);

  // Track if we're ready to render (after one frame to ensure DPR is applied)
  const [isCanvasReady, setIsCanvasReady] = useState(false);
  // Pending changes keyed by ROW INDEX (not row ID) to ensure uniqueness
  // Map<rowIndex, { columnName: newValue }>
  const [pendingChanges, setPendingChanges] = useState<Map<number, Record<string, unknown>>>(
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
  const [_themeVersion, setThemeVersion] = useState(0);

  // Column width overrides (for resize)
  const [columnWidths, setColumnWidths] = useState<Map<string, number>>(new Map());

  // Sorting state
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  // Column order for reordering (stores column indices in display order)
  const [columnOrder, setColumnOrder] = useState<number[] | null>(null);

  // Header menu state
  const [menuColumnIndex, setMenuColumnIndex] = useState<number | null>(null);
  const [menuPosition, setMenuPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);

  // Column editing dialogs
  const [renameDialog, setRenameDialog] = useState<{
    columnName: string;
    newName: string;
  } | null>(null);
  const [typeDialog, setTypeDialog] = useState<{
    columnName: string;
    newType: string;
  } | null>(null);
  const [addColumnDialog, setAddColumnDialog] = useState<{
    name: string;
    type: string;
    nullable: boolean;
  } | null>(null);
  const [dropColumnConfirm, setDropColumnConfirm] = useState<string | null>(null);

  // SQL preview panel
  const [showPreview, setShowPreview] = useState(false);

  // Get data from provider
  const columns = dataProvider.getColumns();
  const totalRows = dataProvider.getTotalRows();
  const loadedCount = dataProvider.getLoadedCount();
  const isLoading = dataProvider.isLoading;
  const isFetching = dataProvider.isFetching;
  const isMutating = dataProvider.isMutating;

  // Generate SQL preview for pending changes
  const pendingSql = useMemo<PendingChange[]>(() => {
    const changes: PendingChange[] = [];
    const pk = dataProvider.getPrimaryKeyColumn();

    pendingChanges.forEach((data, rowIndex) => {
      const rowData = dataProvider.getRow(rowIndex);
      if (!rowData) return;
      const rowId = dataProvider.getRowId(rowData);
      changes.push({
        type: "update",
        sql: generateUpdateSql(tableName, pk, rowId, data),
        rowId,
        data,
      });
    });

    return changes;
  }, [pendingChanges, tableName, dataProvider]);

  // Measure container size
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

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

  // Wait one frame after container measurement to ensure canvas DPR is correct
  useEffect(() => {
    if (!containerSize || isCanvasReady) return;

    const frame = requestAnimationFrame(() => {
      setIsCanvasReady(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [containerSize, isCanvasReady]);

  // Watch for theme changes
  useEffect(() => {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.attributeName === "class") {
          setThemeVersion((v) => v + 1);
        }
      }
    });

    observer.observe(document.documentElement, { attributes: true });
    return () => observer.disconnect();
  }, []);

  // Reset state when table changes
  useEffect(() => {
    setGridSelection({
      columns: CompactSelection.empty(),
      rows: CompactSelection.empty(),
    });
    setSelectedIds(new Set());
    setPendingChanges(new Map());
    setColumnWidths(new Map());
    setSortColumn(null);
    setSortDirection("asc");
    setColumnOrder(null);
    setMenuColumnIndex(null);
    setMenuPosition(null);
    setIsCanvasReady(false);
    setShowPreview(false);
  }, []);

  // Apply column order
  const orderedColumns = useMemo(() => {
    if (!columnOrder) return columns;
    return columnOrder.filter((i) => i >= 0 && i < columns.length).map((i) => columns[i]);
  }, [columns, columnOrder]);

  // Custom header icons
  const headerIcons = useMemo(
    () => ({
      dots: (p: { fgColor: string }) => {
        return `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="3" cy="8" r="1.5" fill="${p.fgColor}"/>
          <circle cx="8" cy="8" r="1.5" fill="${p.fgColor}"/>
          <circle cx="13" cy="8" r="1.5" fill="${p.fgColor}"/>
        </svg>`;
      },
    }),
    [],
  );

  // Build grid columns
  const gridColumns = useMemo<GridColumn[]>(() => {
    return orderedColumns.map((col) => {
      const isSorted = sortColumn === col.name;
      const sortIndicator = isSorted ? (sortDirection === "asc" ? " ↑" : " ↓") : "";
      return {
        id: col.name,
        title: col.name + sortIndicator,
        width: columnWidths.get(col.name) ?? getColumnWidth(col),
        hasMenu: true,
        menuIcon: "dots",
      };
    });
  }, [orderedColumns, columnWidths, sortColumn, sortDirection]);

  // Column name lookup
  const columnNames = useMemo(() => orderedColumns.map((col) => col.name), [orderedColumns]);

  // Compute theme from CSS variables
  const gridTheme = useMemo<Partial<Theme>>(() => {
    if (typeof window === "undefined") return {};
    return {
      accentColor: getCssVar("--primary"),
      accentFg: getCssVar("--primary-foreground"),
      accentLight: blendWithBackground("--primary", "--background", 0.08),
      textDark: getCssVar("--foreground"),
      textMedium: getCssVar("--muted-foreground"),
      textLight: blendWithBackground("--muted-foreground", "--background", 0.5),
      textBubble: getCssVar("--foreground"),
      bgIconHeader: getCssVar("--background"),
      fgIconHeader: getCssVar("--muted-foreground"),
      textHeader: getCssVar("--muted-foreground"),
      textHeaderSelected: getCssVar("--primary"),
      bgCell: getCssVar("--background"),
      bgCellMedium: getCssVar("--background"),
      bgHeader: blendWithBackground("--muted", "--background", 0.3),
      bgHeaderHasFocus: blendWithBackground("--primary", "--background", 0.08),
      bgHeaderHovered: blendWithBackground("--muted", "--background", 0.5),
      bgBubble: getCssVar("--muted"),
      bgBubbleSelected: blendWithBackground("--primary", "--background", 0.15),
      bgSearchResult: blendWithBackground("--primary", "--background", 0.2),
      borderColor: blendWithBackground("--border", "--background", 0.5),
      drilldownBorder: getCssVar("--border"),
      linkColor: getCssVar("--primary"),
      cellHorizontalPadding: 8,
      cellVerticalPadding: 3,
      headerFontStyle: "500 12px",
      baseFontStyle: "13px",
      fontFamily:
        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
      editorFontSize: "13px",
      lineHeight: 1.4,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle visible region changes for infinite scroll
  const onVisibleRegionChanged = useCallback(
    (range: Rectangle) => {
      const buffer = 50;
      const startRow = Math.max(0, range.y - buffer);
      const endRow = Math.min(totalRows, range.y + range.height + buffer);
      dataProvider.loadRange(startRow, endRow);
    },
    [dataProvider, totalRows],
  );

  // Get cell content callback
  const getCellContent = useCallback(
    (cell: Item): GridCell => {
      const [col, row] = cell;

      if (col >= columnNames.length) {
        return { kind: GridCellKind.Loading, allowOverlay: false };
      }

      const rowData = dataProvider.getRow(row);

      if (!rowData) {
        return { kind: GridCellKind.Loading, allowOverlay: false };
      }

      const columnName = columnNames[col];
      const columnDef = orderedColumns[col];

      // Check for pending changes (keyed by row index for uniqueness)
      const pending = pendingChanges.get(row);
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

      // Handle boolean values
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
    [dataProvider, columnNames, orderedColumns, pendingChanges, editable],
  );

  // Handle cell edits (use row index as key for uniqueness)
  const onCellEdited = useCallback(
    (cell: Item, newValue: EditableGridCell) => {
      if (!editable) return;

      const [col, row] = cell;
      const rowData = dataProvider.getRow(row);
      if (!rowData) return;

      const columnName = columnNames[col];

      let value: unknown;
      if (newValue.kind === GridCellKind.Text) {
        value = newValue.data;
      } else if (newValue.kind === GridCellKind.Number) {
        value = newValue.data;
      } else if (newValue.kind === GridCellKind.Boolean) {
        value = newValue.data;
      }

      // Key by row index (always unique) not row ID (may have duplicates)
      setPendingChanges((prev) => {
        const next = new Map(prev);
        const existing = next.get(row) ?? {};
        next.set(row, { ...existing, [columnName]: value });
        return next;
      });
    },
    [editable, dataProvider, columnNames],
  );

  // Save pending changes (convert row indices to row IDs for SQL)
  const handleSaveChanges = useCallback(async () => {
    if (pendingChanges.size === 0 || !dataProvider.bulkUpdate) return;

    try {
      const updates: Array<{ id: string; data: Record<string, unknown> }> = [];

      pendingChanges.forEach((data, rowIndex) => {
        const rowData = dataProvider.getRow(rowIndex);
        if (!rowData) return;
        const rowId = dataProvider.getRowId(rowData);
        updates.push({ id: rowId, data });
      });

      if (updates.length === 0) {
        toast.error("No valid rows to update");
        return;
      }

      await dataProvider.bulkUpdate(updates);
      setPendingChanges(new Map());
      setShowPreview(false);
      toast.success(`Saved ${updates.length} changes`);
    } catch (error) {
      toast.error(`Failed to save: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }, [pendingChanges, dataProvider]);

  // Discard pending changes (just clear local state, don't invalidate cache)
  const handleDiscardChanges = useCallback(() => {
    setPendingChanges(new Map());
    setShowPreview(false);
    toast.info("Changes discarded");
  }, []);

  // Add new row
  const handleAddRow = useCallback(async () => {
    if (!dataProvider.createRow) return;

    try {
      const newData: Record<string, unknown> = {};
      for (const col of columns) {
        if (col.defaultValue) {
          newData[col.name] = col.defaultValue;
        } else if (!col.nullable && !col.isPrimaryKey) {
          if (col.type.includes("int") || col.type.includes("numeric")) {
            newData[col.name] = 0;
          } else if (col.type === "boolean") {
            newData[col.name] = false;
          } else {
            newData[col.name] = "";
          }
        }
      }
      await dataProvider.createRow(newData);
      toast.success("Row added");
    } catch (error) {
      toast.error(`Failed to add row: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }, [columns, dataProvider]);

  // Delete selected rows
  const handleDeleteSelected = useCallback(async () => {
    if (selectedIds.size === 0 || !dataProvider.bulkDelete) return;

    try {
      const ids = Array.from(selectedIds);
      await dataProvider.bulkDelete(ids);
      setSelectedIds(new Set());
      toast.success(`Deleted ${ids.length} rows`);
    } catch (error) {
      toast.error(`Failed to delete: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }, [selectedIds, dataProvider]);

  // Handle grid selection changes
  const onGridSelectionChange = useCallback(
    (selection: GridSelection) => {
      setGridSelection(selection);

      const newIds = new Set<string>();
      if (selection.rows) {
        for (const rowIndex of selection.rows) {
          const row = dataProvider.getRow(rowIndex);
          if (row) {
            newIds.add(dataProvider.getRowId(row));
          }
        }
      }
      setSelectedIds(newIds);
    },
    [dataProvider],
  );

  // Handle column resize
  const onColumnResize = useCallback((column: GridColumn, newSize: number) => {
    setColumnWidths((prev) => {
      const next = new Map(prev);
      next.set(column.id as string, newSize);
      return next;
    });
  }, []);

  // Handle header menu click
  const onHeaderMenuClick = useCallback(
    (col: number, bounds: Rectangle) => {
      const columnName = columnNames[col];
      if (!columnName) return;

      setMenuColumnIndex(col);
      setMenuPosition({
        x: bounds.x + bounds.width - 10,
        y: bounds.y + bounds.height,
      });
    },
    [columnNames],
  );

  // Close menu
  const closeMenu = useCallback(() => {
    setMenuColumnIndex(null);
    setMenuPosition(null);
  }, []);

  // Sort handlers
  const handleSortAsc = useCallback(() => {
    if (menuColumnIndex === null) return;
    const columnName = columnNames[menuColumnIndex];
    if (columnName) {
      setSortColumn(columnName);
      setSortDirection("asc");
      onSortChange?.(columnName, "asc");
    }
    closeMenu();
  }, [menuColumnIndex, columnNames, closeMenu, onSortChange]);

  const handleSortDesc = useCallback(() => {
    if (menuColumnIndex === null) return;
    const columnName = columnNames[menuColumnIndex];
    if (columnName) {
      setSortColumn(columnName);
      setSortDirection("desc");
      onSortChange?.(columnName, "desc");
    }
    closeMenu();
  }, [menuColumnIndex, columnNames, closeMenu, onSortChange]);

  const handleClearSort = useCallback(() => {
    setSortColumn(null);
    setSortDirection("asc");
    onSortChange?.(null, "asc");
    closeMenu();
  }, [closeMenu, onSortChange]);

  // Handle column reordering
  const onColumnMoved = useCallback(
    (startIndex: number, endIndex: number) => {
      setColumnOrder((prevOrder) => {
        const currentOrder = prevOrder ?? columns.map((_, i) => i);
        const newOrder = [...currentOrder];
        const [moved] = newOrder.splice(startIndex, 1);
        newOrder.splice(endIndex, 0, moved);
        return newOrder;
      });
    },
    [columns],
  );

  // Column operation handlers
  const handleRenameColumn = useCallback(async () => {
    if (!renameDialog || !dataProvider.renameColumn) return;
    try {
      await dataProvider.renameColumn(renameDialog.columnName, renameDialog.newName);
      setRenameDialog(null);
      toast.success(`Renamed column to "${renameDialog.newName}"`);
    } catch (error) {
      toast.error(`Failed to rename: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }, [renameDialog, dataProvider]);

  const handleChangeColumnType = useCallback(async () => {
    if (!typeDialog || !dataProvider.changeColumnType) return;
    try {
      await dataProvider.changeColumnType(typeDialog.columnName, typeDialog.newType);
      setTypeDialog(null);
      toast.success(`Changed column type to ${typeDialog.newType}`);
    } catch (error) {
      toast.error(
        `Failed to change type: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }, [typeDialog, dataProvider]);

  const handleAddColumn = useCallback(async () => {
    if (!addColumnDialog || !dataProvider.addColumn) return;
    try {
      await dataProvider.addColumn(addColumnDialog.name, addColumnDialog.type, {
        nullable: addColumnDialog.nullable,
      });
      setAddColumnDialog(null);
      toast.success(`Added column "${addColumnDialog.name}"`);
    } catch (error) {
      toast.error(
        `Failed to add column: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }, [addColumnDialog, dataProvider]);

  const handleDropColumn = useCallback(async () => {
    if (!dropColumnConfirm || !dataProvider.dropColumn) return;
    try {
      await dataProvider.dropColumn(dropColumnConfirm);
      setDropColumnConfirm(null);
      toast.success(`Dropped column "${dropColumnConfirm}"`);
    } catch (error) {
      toast.error(
        `Failed to drop column: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }, [dropColumnConfirm, dataProvider]);

  // Get current column from menu
  const currentMenuColumn = menuColumnIndex !== null ? orderedColumns[menuColumnIndex] : null;

  if (columns.length === 0 && !isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Table not found or has no columns
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-background">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <TableIcon weight="fill" className="h-4 w-4 text-primary/70" />
          <span className="font-medium text-foreground">{tableName}</span>
          <span className="text-xs">
            {totalRows.toLocaleString()} rows
            {loadedCount < totalRows && ` (${loadedCount.toLocaleString()} loaded)`}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {editable && (
            <>
              {/* Add Column button */}
              {dataProvider.addColumn && (
                <button
                  type="button"
                  onClick={() => setAddColumnDialog({ name: "", type: "TEXT", nullable: true })}
                  disabled={isMutating}
                  className="flex items-center gap-1 px-2 py-1 text-xs rounded hover:bg-muted disabled:opacity-50"
                  title="Add column"
                >
                  <Plus weight="bold" className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Column</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleAddRow}
                disabled={isMutating || !dataProvider.createRow}
                className="flex items-center gap-1 px-2 py-1 text-xs rounded hover:bg-muted disabled:opacity-50"
                title="Add row"
              >
                <Plus weight="bold" className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Row</span>
              </button>

              {selectedIds.size > 0 && (
                <button
                  type="button"
                  onClick={handleDeleteSelected}
                  disabled={isMutating || !dataProvider.bulkDelete}
                  className="flex items-center gap-1 px-2 py-1 text-xs rounded text-destructive hover:bg-destructive/10 disabled:opacity-50"
                  title={`Delete ${selectedIds.size} selected`}
                >
                  <Trash weight="bold" className="h-3.5 w-3.5" />
                </button>
              )}

              {pendingChanges.size > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => setShowPreview(!showPreview)}
                    className={cn(
                      "flex items-center gap-1 px-2 py-1 text-xs rounded hover:bg-muted",
                      showPreview && "bg-muted",
                    )}
                    title="Preview SQL"
                  >
                    <Eye weight="bold" className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={handleDiscardChanges}
                    disabled={isMutating}
                    className="flex items-center gap-1 px-2 py-1 text-xs rounded hover:bg-muted text-muted-foreground disabled:opacity-50"
                    title="Discard changes"
                  >
                    <X weight="bold" className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveChanges}
                    disabled={isMutating || !dataProvider.bulkUpdate}
                    className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    <FloppyDisk weight="bold" className="h-3.5 w-3.5" />
                    <span>Save ({pendingChanges.size})</span>
                  </button>
                </>
              )}
            </>
          )}

          {(isFetching || isMutating) && (
            <CircleNotch weight="bold" className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          )}
        </div>
      </div>

      {/* SQL Preview Panel */}
      {showPreview && pendingSql.length > 0 && (
        <div className="border-b bg-muted/30 max-h-48 overflow-auto">
          <div className="px-3 py-2 flex items-center gap-2 text-xs font-medium text-muted-foreground border-b">
            <Code weight="bold" className="h-3.5 w-3.5" />
            SQL Preview ({pendingSql.length} statements)
          </div>
          <div className="p-2 space-y-1">
            {pendingSql.map((change, i) => (
              <pre
                key={i}
                className="text-xs font-mono bg-background p-2 rounded border overflow-x-auto"
              >
                {change.sql}
              </pre>
            ))}
          </div>
        </div>
      )}

      {/* Data grid */}
      <div ref={containerRef} className="flex-1 overflow-hidden relative">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <CircleNotch weight="bold" className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : !containerSize || !isCanvasReady ? (
          <div className="flex items-center justify-center h-full">
            <CircleNotch weight="bold" className="h-6 w-6 animate-spin text-muted-foreground/50" />
          </div>
        ) : (
          <>
            <DataEditor
              key={tableName}
              columns={gridColumns}
              rows={totalRows}
              getCellContent={getCellContent}
              getCellsForSelection={true}
              onCellEdited={editable ? onCellEdited : undefined}
              onVisibleRegionChanged={onVisibleRegionChanged}
              gridSelection={gridSelection}
              onGridSelectionChange={onGridSelectionChange}
              rowSelectionMode="multi"
              rangeSelect="rect"
              columnSelect="single"
              onColumnResize={onColumnResize}
              onColumnMoved={onColumnMoved}
              onHeaderMenuClick={onHeaderMenuClick}
              headerIcons={headerIcons}
              smoothScrollX
              smoothScrollY
              scaleToRem
              width={containerSize.width}
              height={containerSize.height}
              rowHeight={28}
              headerHeight={32}
              theme={gridTheme}
              rowMarkers="clickable-number"
            />

            {/* Empty state overlay - shows below header when no rows */}
            {totalRows === 0 && (
              <div
                className="absolute inset-x-0 bottom-0 flex flex-col items-center justify-center text-muted-foreground pointer-events-none"
                style={{ top: 32 }} // Below header row
              >
                <TableIcon weight="duotone" className="h-10 w-10 mb-2 opacity-40" />
                <p className="text-sm">No rows yet</p>
                {editable && dataProvider.createRow && (
                  <button
                    type="button"
                    onClick={handleAddRow}
                    className="mt-3 flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 pointer-events-auto"
                  >
                    <Plus weight="bold" className="h-3.5 w-3.5" />
                    Add Row
                  </button>
                )}
              </div>
            )}

            {/* Column header menu dropdown */}
            {menuPosition && menuColumnIndex !== null && currentMenuColumn && (
              <div className="fixed z-50" style={{ left: menuPosition.x, top: menuPosition.y }}>
                <div
                  className="absolute inset-0 fixed"
                  onClick={closeMenu}
                  onKeyDown={(e) => e.key === "Escape" && closeMenu()}
                />
                <div className="relative bg-popover border rounded-md shadow-lg py-1 min-w-[200px]">
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
                            "bg-accent text-primary",
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
                            "bg-accent text-primary",
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

                  {/* Column operations - only show if editable */}
                  {editable && (
                    <>
                      <div className="border-t my-1" />

                      {/* Rename Column */}
                      {dataProvider.renameColumn && (
                        <button
                          type="button"
                          onClick={() => {
                            setRenameDialog({
                              columnName: currentMenuColumn.name,
                              newName: currentMenuColumn.name,
                            });
                            closeMenu();
                          }}
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent"
                        >
                          <PencilSimple weight="bold" className="h-4 w-4" />
                          Rename Column
                        </button>
                      )}

                      {/* Change Type */}
                      {dataProvider.changeColumnType && (
                        <button
                          type="button"
                          onClick={() => {
                            setTypeDialog({
                              columnName: currentMenuColumn.name,
                              newType: currentMenuColumn.type,
                            });
                            closeMenu();
                          }}
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent"
                        >
                          <CaretRight weight="bold" className="h-4 w-4" />
                          Change Type
                          <span className="ml-auto text-xs text-muted-foreground">
                            {currentMenuColumn.type}
                          </span>
                        </button>
                      )}

                      {/* Drop Column */}
                      {dataProvider.dropColumn && !currentMenuColumn.isPrimaryKey && (
                        <button
                          type="button"
                          onClick={() => {
                            setDropColumnConfirm(currentMenuColumn.name);
                            closeMenu();
                          }}
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent text-destructive"
                        >
                          <Trash weight="bold" className="h-4 w-4" />
                          Drop Column
                        </button>
                      )}
                    </>
                  )}

                  <div className="border-t my-1" />

                  {/* Subscribe */}
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

      {/* Rename Column Dialog */}
      {renameDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-popover border rounded-lg shadow-lg p-4 w-80">
            <h3 className="font-medium mb-3">Rename Column</h3>
            <div className="mb-3">
              <label className="block text-xs text-muted-foreground mb-1">New name</label>
              <input
                type="text"
                value={renameDialog.newName}
                onChange={(e) => setRenameDialog({ ...renameDialog, newName: e.target.value })}
                className="w-full px-2 py-1.5 text-sm border rounded bg-background"
              />
            </div>
            <div className="mb-3">
              <label className="block text-xs text-muted-foreground mb-1">SQL Preview</label>
              <pre className="text-xs font-mono bg-muted p-2 rounded overflow-x-auto">
                {generateRenameColumnSql(tableName, renameDialog.columnName, renameDialog.newName)}
              </pre>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setRenameDialog(null)}
                className="px-3 py-1.5 text-sm rounded hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRenameColumn}
                disabled={!renameDialog.newName || renameDialog.newName === renameDialog.columnName}
                className="px-3 py-1.5 text-sm rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                Rename
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Change Type Dialog */}
      {typeDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-popover border rounded-lg shadow-lg p-4 w-80">
            <h3 className="font-medium mb-3">Change Column Type</h3>
            <div className="mb-3">
              <label className="block text-xs text-muted-foreground mb-1">
                Column: {typeDialog.columnName}
              </label>
              <select
                value={typeDialog.newType}
                onChange={(e) => setTypeDialog({ ...typeDialog, newType: e.target.value })}
                className="w-full px-2 py-1.5 text-sm border rounded bg-background"
              >
                {SQL_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>
            <div className="mb-3">
              <label className="block text-xs text-muted-foreground mb-1">SQL Preview</label>
              <pre className="text-xs font-mono bg-muted p-2 rounded overflow-x-auto">
                {generateAlterColumnTypeSql(tableName, typeDialog.columnName, typeDialog.newType)}
              </pre>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setTypeDialog(null)}
                className="px-3 py-1.5 text-sm rounded hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleChangeColumnType}
                className="px-3 py-1.5 text-sm rounded bg-primary text-primary-foreground hover:bg-primary/90"
              >
                Change Type
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Column Dialog */}
      {addColumnDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-popover border rounded-lg shadow-lg p-4 w-80">
            <h3 className="font-medium mb-3">Add Column</h3>
            <div className="mb-3">
              <label className="block text-xs text-muted-foreground mb-1">Column name</label>
              <input
                type="text"
                value={addColumnDialog.name}
                onChange={(e) => setAddColumnDialog({ ...addColumnDialog, name: e.target.value })}
                className="w-full px-2 py-1.5 text-sm border rounded bg-background"
                placeholder="column_name"
              />
            </div>
            <div className="mb-3">
              <label className="block text-xs text-muted-foreground mb-1">Type</label>
              <select
                value={addColumnDialog.type}
                onChange={(e) => setAddColumnDialog({ ...addColumnDialog, type: e.target.value })}
                className="w-full px-2 py-1.5 text-sm border rounded bg-background"
              >
                {SQL_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>
            <div className="mb-3 flex items-center gap-2">
              <input
                type="checkbox"
                id="nullable"
                checked={addColumnDialog.nullable}
                onChange={(e) =>
                  setAddColumnDialog({ ...addColumnDialog, nullable: e.target.checked })
                }
                className="rounded"
              />
              <label htmlFor="nullable" className="text-sm">
                Allow NULL values
              </label>
            </div>
            <div className="mb-3">
              <label className="block text-xs text-muted-foreground mb-1">SQL Preview</label>
              <pre className="text-xs font-mono bg-muted p-2 rounded overflow-x-auto">
                {addColumnDialog.name
                  ? generateAddColumnSql(tableName, addColumnDialog.name, addColumnDialog.type, {
                      nullable: addColumnDialog.nullable,
                    })
                  : "-- Enter column name"}
              </pre>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setAddColumnDialog(null)}
                className="px-3 py-1.5 text-sm rounded hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddColumn}
                disabled={!addColumnDialog.name}
                className="px-3 py-1.5 text-sm rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                Add Column
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Drop Column Confirmation */}
      {dropColumnConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-popover border rounded-lg shadow-lg p-4 w-80">
            <h3 className="font-medium mb-3 text-destructive">Drop Column</h3>
            <p className="text-sm text-muted-foreground mb-3">
              Are you sure you want to drop column "{dropColumnConfirm}"? This action cannot be
              undone.
            </p>
            <div className="mb-3">
              <label className="block text-xs text-muted-foreground mb-1">SQL Preview</label>
              <pre className="text-xs font-mono bg-muted p-2 rounded overflow-x-auto">
                {generateDropColumnSql(tableName, dropColumnConfirm)}
              </pre>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setDropColumnConfirm(null)}
                className="px-3 py-1.5 text-sm rounded hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDropColumn}
                className="px-3 py-1.5 text-sm rounded bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Drop Column
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
