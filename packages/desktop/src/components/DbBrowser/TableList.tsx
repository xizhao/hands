/**
 * Table List Component
 *
 * Shows list of database tables with change indicators.
 */

import { Table2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTableLatestChange, getTableIndicatorColor } from "@/store/db-hooks";
import type { TableInfo } from "@/store/db-browser";

interface TableListProps {
  tables: TableInfo[];
  selectedTable: string | null;
  onSelectTable: (name: string) => void;
  isLoading?: boolean;
}

export function TableList({
  tables,
  selectedTable,
  onSelectTable,
  isLoading,
}: TableListProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
      </div>
    );
  }

  if (tables.length === 0) {
    return (
      <div className="px-3 py-4 text-xs text-zinc-500 text-center">
        No tables found
      </div>
    );
  }

  return (
    <div className="py-2">
      {tables.map((table) => (
        <TableListItem
          key={table.name}
          table={table}
          isSelected={selectedTable === table.name}
          onClick={() => onSelectTable(table.name)}
        />
      ))}
    </div>
  );
}

interface TableListItemProps {
  table: TableInfo;
  isSelected: boolean;
  onClick: () => void;
}

function TableListItem({ table, isSelected, onClick }: TableListItemProps) {
  const latestChange = useTableLatestChange(table.name);
  const indicatorColor = getTableIndicatorColor(latestChange);

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-2 px-3 py-2 text-left transition-colors",
        isSelected
          ? "bg-blue-500/10 text-blue-400"
          : "hover:bg-zinc-800 text-zinc-300"
      )}
    >
      <Table2 className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-xs truncate">{table.name}</div>
        <div className="text-[10px] text-zinc-500">
          {table.column_count} col{table.column_count !== 1 ? "s" : ""}
        </div>
      </div>
      {indicatorColor && (
        <span
          className={cn(
            "h-2 w-2 rounded-full animate-pulse shrink-0",
            indicatorColor
          )}
        />
      )}
    </button>
  );
}
