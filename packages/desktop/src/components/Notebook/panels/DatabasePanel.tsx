/**
 * DatabasePanel - Shows database tables with data browser
 */

import { CaretDown, CaretRight, CircleNotch, Table } from "@phosphor-icons/react";
import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useActiveWorkbookId, useDbSchema, useRuntimeQuery } from "@/hooks/useWorkbook";
import { cn } from "@/lib/utils";

export function DatabasePanel() {
  const activeWorkbookId = useActiveWorkbookId();
  const { data: schema, isLoading } = useDbSchema(activeWorkbookId);
  const [expandedTable, setExpandedTable] = useState<string | null>(null);
  const [tableData, setTableData] = useState<Record<string, unknown[] | null>>({});
  const [loadingTable, setLoadingTable] = useState<string | null>(null);
  const runtimeQuery = useRuntimeQuery();

  const handleExpandTable = async (tableName: string) => {
    if (expandedTable === tableName) {
      setExpandedTable(null);
      return;
    }

    setExpandedTable(tableName);

    // Load table data if not already loaded
    if (!tableData[tableName] && activeWorkbookId) {
      setLoadingTable(tableName);
      try {
        const result = await runtimeQuery.mutateAsync({
          workbookId: activeWorkbookId,
          query: `SELECT * FROM "${tableName}" LIMIT 100`,
        });
        setTableData((prev) => ({ ...prev, [tableName]: result.rows }));
      } catch (err) {
        console.error("Failed to load table data:", err);
        setTableData((prev) => ({ ...prev, [tableName]: [] }));
      } finally {
        setLoadingTable(null);
      }
    }
  };

  if (isLoading) {
    return <div className="p-4 text-sm text-muted-foreground">Loading tables...</div>;
  }

  if (!schema || schema.length === 0) {
    return (
      <div className="p-4">
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Table weight="duotone" className="h-8 w-8 text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground">No tables yet</p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            Create tables in your workbook to browse data here
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {schema.map((table) => (
            <div key={table.table_name}>
              {/* Table header */}
              <button
                onClick={() => handleExpandTable(table.table_name)}
                className={cn(
                  "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left",
                  "text-sm hover:bg-accent transition-colors",
                  expandedTable === table.table_name && "bg-accent",
                )}
              >
                {expandedTable === table.table_name ? (
                  <CaretDown weight="bold" className="h-3 w-3 text-muted-foreground shrink-0" />
                ) : (
                  <CaretRight weight="bold" className="h-3 w-3 text-muted-foreground shrink-0" />
                )}
                <Table weight="duotone" className="h-4 w-4 text-blue-400 shrink-0" />
                <span className="flex-1 truncate font-medium">{table.table_name}</span>
                <span className="text-xs text-muted-foreground">{table.columns.length} cols</span>
              </button>

              {/* Expanded table view */}
              {expandedTable === table.table_name && (
                <div className="mt-1 ml-5 border-l border-border pl-2">
                  {/* Columns */}
                  <div className="mb-2">
                    <div className="text-[10px] uppercase text-muted-foreground font-medium px-2 py-1">
                      Columns
                    </div>
                    {table.columns.map((col) => (
                      <div key={col.name} className="flex items-center gap-2 px-2 py-0.5 text-xs">
                        <span className="text-foreground">{col.name}</span>
                        <span className="text-muted-foreground/60">{col.type}</span>
                        {!col.nullable && (
                          <span className="text-[9px] text-orange-400">NOT NULL</span>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Data preview */}
                  <div>
                    <div className="text-[10px] uppercase text-muted-foreground font-medium px-2 py-1">
                      Data Preview
                    </div>
                    {loadingTable === table.table_name ? (
                      <div className="flex items-center gap-2 px-2 py-2 text-xs text-muted-foreground">
                        <CircleNotch weight="bold" className="h-3 w-3 animate-spin" />
                        Loading...
                      </div>
                    ) : tableData[table.table_name]?.length === 0 ? (
                      <div className="px-2 py-2 text-xs text-muted-foreground">No data</div>
                    ) : tableData[table.table_name] ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-[11px]">
                          <thead>
                            <tr className="border-b border-border">
                              {table.columns.slice(0, 4).map((col) => (
                                <th
                                  key={col.name}
                                  className="px-2 py-1 text-left font-medium text-muted-foreground"
                                >
                                  {col.name}
                                </th>
                              ))}
                              {table.columns.length > 4 && (
                                <th className="px-2 py-1 text-left font-medium text-muted-foreground">
                                  ...
                                </th>
                              )}
                            </tr>
                          </thead>
                          <tbody>
                            {tableData[table.table_name]?.slice(0, 5).map((row, idx) => (
                              <tr key={idx} className="border-b border-border/50">
                                {table.columns.slice(0, 4).map((col) => (
                                  <td key={col.name} className="px-2 py-1 truncate max-w-[80px]">
                                    {String((row as Record<string, unknown>)[col.name] ?? "")}
                                  </td>
                                ))}
                                {table.columns.length > 4 && (
                                  <td className="px-2 py-1 text-muted-foreground">...</td>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {(tableData[table.table_name]?.length ?? 0) > 5 && (
                          <div className="px-2 py-1 text-[10px] text-muted-foreground">
                            +{(tableData[table.table_name]?.length ?? 0) - 5} more rows
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
