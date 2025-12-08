/**
 * Data Grid Component
 *
 * Displays table rows with change highlighting and pagination.
 */

import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useTableRows,
  useTableColumns,
  formatCellValue,
  getRowHighlightClass,
} from "@/store/db-hooks";
import { ScrollArea } from "@/components/ui/scroll-area";

interface DataGridProps {
  tableName: string;
}

export function DataGrid({ tableName }: DataGridProps) {
  const [page, setPage] = useState(0);
  const pageSize = 50;

  const { data: rowsData, isLoading: rowsLoading, changeMap } = useTableRows(
    tableName,
    page,
    pageSize
  );
  const { data: columns = [], isLoading: columnsLoading } = useTableColumns(tableName);

  const isLoading = rowsLoading || columnsLoading;

  // Reset page when table changes
  useMemo(() => {
    setPage(0);
  }, [tableName]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
      </div>
    );
  }

  const rows = rowsData?.rows || [];
  const total = rowsData?.total || 0;
  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="flex flex-col h-full">
      {/* Table header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800 bg-zinc-900/50">
        <span className="text-xs font-medium text-zinc-200">{tableName}</span>
        <span className="text-xs text-zinc-500">
          {total} row{total !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Data table */}
      <ScrollArea className="flex-1">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-zinc-900 border-b border-zinc-800">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.name}
                  className="px-3 py-2 text-left font-medium text-zinc-400"
                >
                  <div className="flex flex-col">
                    <span className={cn(col.is_primary && "text-blue-400")}>
                      {col.name}
                      {col.is_primary && " *"}
                    </span>
                    <span className="text-[10px] text-zinc-600 font-normal">
                      {col.type}
                    </span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-3 py-8 text-center text-zinc-500"
                >
                  No rows
                </td>
              </tr>
            ) : (
              rows.map((row, idx) => {
                const rowId = String(row.id ?? idx);
                const change = changeMap.get(rowId);
                const highlightClass = getRowHighlightClass(change);

                return (
                  <tr
                    key={rowId}
                    className={cn(
                      "border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors",
                      highlightClass
                    )}
                  >
                    {columns.map((col) => (
                      <td
                        key={col.name}
                        className="px-3 py-2 truncate max-w-[200px] text-zinc-300"
                        title={formatCellValue(row[col.name])}
                      >
                        <span
                          className={cn(
                            row[col.name] === null && "text-zinc-600 italic"
                          )}
                        >
                          {formatCellValue(row[col.name])}
                        </span>
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </ScrollArea>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-3 py-2 border-t border-zinc-800 bg-zinc-900/50">
          <span className="text-xs text-zinc-500">
            Page {page + 1} of {totalPages}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="p-1 rounded hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed text-zinc-400"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="p-1 rounded hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed text-zinc-400"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
