/**
 * SourcesPanel - Shows database tables and data sources
 */

import { useDbSchema, useActiveWorkbookId } from "@/hooks/useWorkbook";
import { TreeStructure, Table, CaretRight } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

export function SourcesPanel() {
  const activeWorkbookId = useActiveWorkbookId();
  const { data: schema, isLoading } = useDbSchema(activeWorkbookId);

  if (isLoading) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        Loading sources...
      </div>
    );
  }

  if (!schema || schema.length === 0) {
    return (
      <div className="p-4">
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <TreeStructure weight="duotone" className="h-8 w-8 text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground">No sources yet</p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            Connect data sources to see them here
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-2">
      <div className="space-y-1">
        {schema.map((table) => (
          <button
            key={table.table_name}
            className={cn(
              "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left",
              "text-sm text-foreground hover:bg-accent transition-colors"
            )}
          >
            <Table weight="duotone" className="h-4 w-4 text-blue-400 shrink-0" />
            <span className="flex-1 truncate">{table.table_name}</span>
            <span className="text-xs text-muted-foreground">
              {table.columns.length} cols
            </span>
            <CaretRight weight="bold" className="h-3 w-3 text-muted-foreground/50" />
          </button>
        ))}
      </div>
    </div>
  );
}
