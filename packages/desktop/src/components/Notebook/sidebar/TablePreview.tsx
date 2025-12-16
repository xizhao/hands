/**
 * TablePreview - Shows schema and sample data preview for tables
 *
 * Used in:
 * - HoverCard content for table items in sidebar
 */

import { useTablePreview } from "@/hooks/useTablePreview";
import { cn } from "@/lib/utils";

interface TablePreviewProps {
  tableName: string;
  className?: string;
}

export function TablePreview({ tableName, className }: TablePreviewProps) {
  const { data: preview, isLoading } = useTablePreview(tableName);

  if (isLoading) {
    return (
      <div className={cn("w-64 p-2", className)}>
        <div className="animate-pulse space-y-2">
          <div className="h-4 bg-muted rounded w-3/4" />
          <div className="h-3 bg-muted rounded w-1/2" />
          <div className="h-12 bg-muted rounded" />
        </div>
      </div>
    );
  }

  if (!preview || preview.columns.length === 0) {
    return (
      <div className={cn("w-64 p-2 text-sm text-muted-foreground", className)}>
        No schema available
      </div>
    );
  }

  const { columns, sampleRows, totalRows } = preview;

  // Truncate cell value for display
  const formatCell = (value: unknown): string => {
    if (value === null || value === undefined) return "NULL";
    const str = String(value);
    return str.length > 20 ? `${str.slice(0, 17)}...` : str;
  };

  return (
    <div className={cn("w-64 space-y-1.5", className)}>
      {/* Header with row count */}
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span className="font-medium text-foreground/80 truncate max-w-[160px]">{tableName}</span>
        <span>{totalRows.toLocaleString()} rows</span>
      </div>

      {/* Schema columns - compact chips */}
      <div className="flex flex-wrap gap-0.5">
        {columns.slice(0, 5).map((col, i) => (
          <span
            key={col.name}
            className={cn(
              "text-[9px] px-1 py-0.5 rounded bg-muted/40 text-muted-foreground",
              i === 0 && "bg-purple-500/15 text-purple-400",
            )}
            title={`${col.name} (${col.type})`}
          >
            {col.name}
          </span>
        ))}
        {columns.length > 5 && (
          <span className="text-[9px] px-1 py-0.5 text-muted-foreground/60">
            +{columns.length - 5}
          </span>
        )}
      </div>

      {/* Sample data - minimal table */}
      {sampleRows.length > 0 && (
        <div className="overflow-hidden rounded border border-border/30 text-[9px]">
          <table className="w-full">
            <thead>
              <tr className="bg-muted/20">
                {columns.slice(0, 3).map((col) => (
                  <th
                    key={col.name}
                    className="px-1 py-0.5 text-left font-medium text-muted-foreground/70 truncate max-w-[70px]"
                  >
                    {col.name}
                  </th>
                ))}
                {columns.length > 3 && <th className="px-1 py-0.5 text-muted-foreground/50">…</th>}
              </tr>
            </thead>
            <tbody>
              {sampleRows.map((row, rowIndex) => (
                <tr key={rowIndex} className="border-t border-border/20">
                  {columns.slice(0, 3).map((col) => (
                    <td
                      key={col.name}
                      className="px-1 py-0.5 text-foreground/70 truncate max-w-[70px]"
                      title={String(row[col.name] ?? "")}
                    >
                      {formatCell(row[col.name])}
                    </td>
                  ))}
                  {columns.length > 3 && (
                    <td className="px-1 py-0.5 text-muted-foreground/50">…</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Empty state */}
      {sampleRows.length === 0 && totalRows === 0 && (
        <div className="text-[9px] text-muted-foreground/50 italic">Empty</div>
      )}
    </div>
  );
}

/**
 * Check if table preview is available
 */
export function useTablePreviewAvailable(tableName: string | undefined) {
  const { data: preview } = useTablePreview(tableName);
  return !!preview && preview.columns.length > 0;
}
