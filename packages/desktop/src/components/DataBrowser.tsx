/**
 * DataBrowser - High-performance canvas-based data grid
 *
 * Uses Glide Data Grid for efficient rendering of large datasets
 * with native scrolling and cell virtualization.
 */

import { useMemo, useCallback, useState, useRef, useEffect } from "react"
import DataEditor, {
  GridCellKind,
  type GridCell,
  type GridColumn,
  type Item,
} from "@glideapps/glide-data-grid"
import "@glideapps/glide-data-grid/dist/index.css"
import { useTableData, useTableRowCount } from "@/hooks/useTableData"
import { useDbSchema, useActiveWorkbookId } from "@/hooks/useWorkbook"
import { cn } from "@/lib/utils"
import {
  Table as TableIcon,
  ArrowLeft,
  ArrowRight,
  CircleNotch,
} from "@phosphor-icons/react"

interface DataBrowserProps {
  tableName: string
  className?: string
}

const PAGE_SIZE = 500

export function DataBrowser({ tableName, className }: DataBrowserProps) {
  const [page, setPage] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })

  // Measure container size
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) {
        setContainerSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        })
      }
    })

    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  const activeWorkbookId = useActiveWorkbookId()
  const { data: schema } = useDbSchema(activeWorkbookId)
  const tableSchema = schema?.find((t) => t.table_name === tableName)

  // Get total row count
  const { data: totalRows = 0 } = useTableRowCount(tableName)

  // Fetch data with pagination
  const { data, isLoading, isFetching } = useTableData({
    tableName,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  })

  const rows = data?.rows ?? []

  // Build columns for glide-data-grid
  const columns = useMemo<GridColumn[]>(() => {
    if (!tableSchema?.columns) return []

    return tableSchema.columns.map((col) => ({
      id: col.name,
      title: col.name,
      width: 150,
      grow: 1,
    }))
  }, [tableSchema])

  // Column name lookup for getCellContent
  const columnNames = useMemo(() => {
    return tableSchema?.columns?.map((col) => col.name) ?? []
  }, [tableSchema])

  // Get cell content callback - this is called for each visible cell
  const getCellContent = useCallback(
    (cell: Item): GridCell => {
      const [col, row] = cell

      // Safety check
      if (row >= rows.length || col >= columnNames.length) {
        return {
          kind: GridCellKind.Loading,
          allowOverlay: false,
        }
      }

      const rowData = rows[row]
      const columnName = columnNames[col]
      const value = rowData?.[columnName]

      // Handle null values
      if (value === null || value === undefined) {
        return {
          kind: GridCellKind.Text,
          data: "",
          displayData: "null",
          allowOverlay: true,
          readonly: true,
          style: "faded",
        }
      }

      // Handle boolean values
      if (typeof value === "boolean") {
        return {
          kind: GridCellKind.Boolean,
          data: value,
          allowOverlay: false,
          readonly: true,
        }
      }

      // Handle number values
      if (typeof value === "number") {
        return {
          kind: GridCellKind.Number,
          data: value,
          displayData: String(value),
          allowOverlay: true,
          readonly: true,
        }
      }

      // Handle objects/arrays as JSON
      if (typeof value === "object") {
        const jsonStr = JSON.stringify(value)
        return {
          kind: GridCellKind.Text,
          data: jsonStr,
          displayData: jsonStr,
          allowOverlay: true,
          readonly: true,
        }
      }

      // Default to text
      return {
        kind: GridCellKind.Text,
        data: String(value),
        displayData: String(value),
        allowOverlay: true,
        readonly: true,
      }
    },
    [rows, columnNames]
  )

  // Pagination
  const totalPages = Math.ceil(totalRows / PAGE_SIZE)
  const canPrevPage = page > 0
  const canNextPage = page < totalPages - 1

  const goToPrevPage = useCallback(() => {
    if (canPrevPage) setPage((p) => p - 1)
  }, [canPrevPage])

  const goToNextPage = useCallback(() => {
    if (canNextPage) setPage((p) => p + 1)
  }, [canNextPage])

  if (!tableSchema) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Table not found in schema
      </div>
    )
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
            <h1 className="text-lg font-semibold">{tableName}</h1>
            <p className="text-sm text-muted-foreground">
              {totalRows.toLocaleString()} rows &middot; {tableSchema.columns?.length ?? 0} columns
            </p>
          </div>
        </div>

        {/* Pagination controls */}
        <div className="flex items-center gap-2">
          {isFetching && (
            <CircleNotch weight="bold" className="h-4 w-4 animate-spin text-muted-foreground" />
          )}
          <span className="text-sm text-muted-foreground tabular-nums">
            Page {page + 1} of {Math.max(1, totalPages)}
          </span>
          <button
            onClick={goToPrevPage}
            disabled={!canPrevPage}
            className={cn(
              "p-1.5 rounded-md transition-colors",
              canPrevPage
                ? "hover:bg-accent text-foreground"
                : "text-muted-foreground/50 cursor-not-allowed"
            )}
          >
            <ArrowLeft weight="bold" className="h-4 w-4" />
          </button>
          <button
            onClick={goToNextPage}
            disabled={!canNextPage}
            className={cn(
              "p-1.5 rounded-md transition-colors",
              canNextPage
                ? "hover:bg-accent text-foreground"
                : "text-muted-foreground/50 cursor-not-allowed"
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
          </div>
        ) : containerSize.width > 0 && containerSize.height > 0 ? (
          <DataEditor
            columns={columns}
            rows={rows.length}
            getCellContent={getCellContent}
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
  )
}
