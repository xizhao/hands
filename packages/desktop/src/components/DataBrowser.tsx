/**
 * DataBrowser - High-performance virtualized data grid
 *
 * Uses TanStack Table for headless table logic and TanStack Virtual
 * for efficient rendering of large datasets.
 */

import { useMemo, useRef, useState, useCallback } from "react"
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table"
import { useVirtualizer } from "@tanstack/react-virtual"
import { useTableData, useTableRowCount } from "@/hooks/useTableData"
import { useDbSchema, useActiveWorkbookId } from "@/hooks/useWorkbook"
import { cn } from "@/lib/utils"
import {
  Table as TableIcon,
  CaretUp,
  CaretDown,
  ArrowLeft,
  ArrowRight,
  CircleNotch,
} from "@phosphor-icons/react"

interface DataBrowserProps {
  tableName: string
  className?: string
}

const ROW_HEIGHT = 32
const PAGE_SIZE = 100

export function DataBrowser({ tableName, className }: DataBrowserProps) {
  const parentRef = useRef<HTMLDivElement>(null)
  const [sorting, setSorting] = useState<SortingState>([])
  const [page, setPage] = useState(0)

  const activeWorkbookId = useActiveWorkbookId()
  const { data: schema } = useDbSchema(activeWorkbookId)
  const tableSchema = schema?.find((t) => t.table_name === tableName)

  // Get total row count
  const { data: totalRows = 0 } = useTableRowCount(tableName)

  // Build order by from sorting state
  const orderBy = sorting[0]?.id
  const orderDir = sorting[0]?.desc ? "desc" : "asc"

  // Fetch data with pagination
  const { data, isLoading, isFetching } = useTableData({
    tableName,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    orderBy,
    orderDir: orderDir as "asc" | "desc",
  })

  const rows = data?.rows ?? []

  // Dynamically build columns from schema
  const columns = useMemo<ColumnDef<Record<string, unknown>>[]>(() => {
    if (!tableSchema?.columns) return []

    return tableSchema.columns.map((col) => ({
      id: col.name,
      accessorKey: col.name,
      header: col.name,
      cell: ({ getValue }) => {
        const value = getValue()
        if (value === null) return <span className="text-muted-foreground/50 italic">null</span>
        if (typeof value === "boolean") return value ? "true" : "false"
        if (typeof value === "object") return JSON.stringify(value)
        return String(value)
      },
      meta: { type: col.type },
    }))
  }, [tableSchema])

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualSorting: true, // We handle sorting server-side
  })

  const { rows: tableRows } = table.getRowModel()

  // Virtual scrolling for rows
  const rowVirtualizer = useVirtualizer({
    count: tableRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  })

  const virtualRows = rowVirtualizer.getVirtualItems()
  const totalSize = rowVirtualizer.getTotalSize()

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

      {/* Table with virtual scrolling */}
      <div ref={parentRef} className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <CircleNotch weight="bold" className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <table className="w-full border-collapse text-sm">
            {/* Sticky header */}
            <thead className="sticky top-0 z-10 bg-background border-b">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => {
                    const isSorted = header.column.getIsSorted()
                    return (
                      <th
                        key={header.id}
                        onClick={header.column.getToggleSortingHandler()}
                        className={cn(
                          "px-3 py-2 text-left font-medium text-muted-foreground cursor-pointer select-none",
                          "hover:bg-accent/50 transition-colors",
                          "border-r last:border-r-0 border-border/50"
                        )}
                        style={{ minWidth: 120 }}
                      >
                        <div className="flex items-center gap-1">
                          <span className="truncate">
                            {flexRender(header.column.columnDef.header, header.getContext())}
                          </span>
                          {isSorted === "asc" && <CaretUp weight="bold" className="h-3 w-3 shrink-0" />}
                          {isSorted === "desc" && <CaretDown weight="bold" className="h-3 w-3 shrink-0" />}
                        </div>
                        <span className="text-[10px] text-muted-foreground/60 font-normal">
                          {(header.column.columnDef.meta as { type?: string })?.type}
                        </span>
                      </th>
                    )
                  })}
                </tr>
              ))}
            </thead>

            {/* Virtualized body */}
            <tbody
              style={{
                height: `${totalSize}px`,
                width: "100%",
                position: "relative",
              }}
            >
              {virtualRows.map((virtualRow) => {
                const row = tableRows[virtualRow.index]
                return (
                  <tr
                    key={row.id}
                    data-index={virtualRow.index}
                    ref={(node) => rowVirtualizer.measureElement(node)}
                    className="hover:bg-accent/30 transition-colors border-b border-border/30"
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td
                        key={cell.id}
                        className="px-3 py-1.5 truncate border-r last:border-r-0 border-border/30"
                        style={{ minWidth: 120, maxWidth: 300 }}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}

        {/* Empty state */}
        {!isLoading && rows.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <TableIcon weight="duotone" className="h-12 w-12 mb-3 opacity-50" />
            <p>No data in this table</p>
          </div>
        )}
      </div>
    </div>
  )
}
