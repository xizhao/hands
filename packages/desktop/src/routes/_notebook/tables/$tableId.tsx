/**
 * Table Data Route - /tables/:tableId
 *
 * View and explore data in a database table.
 */

import { createFileRoute } from "@tanstack/react-router";
import { useActiveWorkbookId, useDbSchema } from "@/hooks/useWorkbook";
import { Table as TableIcon } from "@phosphor-icons/react";

export const Route = createFileRoute("/_notebook/tables/$tableId")({
  component: TablePage,
});

function TablePage() {
  const { tableId } = Route.useParams();
  const activeWorkbookId = useActiveWorkbookId();
  const { data: schema } = useDbSchema(activeWorkbookId);

  // Find the table info from schema
  const tableInfo = schema?.find((t) => t.table_name === tableId);

  return (
    <div className="h-full flex flex-col bg-background">
      <div className="flex-1 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-lg bg-purple-500/10">
            <TableIcon weight="duotone" className="h-5 w-5 text-purple-500" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">{tableId}</h1>
            {tableInfo && (
              <p className="text-sm text-muted-foreground">
                {tableInfo.columns?.length ?? 0} columns
              </p>
            )}
          </div>
        </div>

        {tableInfo ? (
          <div className="space-y-4">
            <div className="rounded-lg border bg-card">
              <div className="px-4 py-3 border-b">
                <h2 className="text-sm font-medium">Schema</h2>
              </div>
              <div className="divide-y">
                {tableInfo.columns?.map((col) => (
                  <div
                    key={col.name}
                    className="px-4 py-2 flex items-center justify-between text-sm"
                  >
                    <span className="font-mono">{col.name}</span>
                    <span className="text-muted-foreground font-mono text-xs">
                      {col.type}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">
            Table not found in schema
          </div>
        )}
      </div>
    </div>
  );
}
