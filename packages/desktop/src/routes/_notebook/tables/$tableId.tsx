/**
 * Table Data Route - /tables/:tableId
 *
 * Full database browser for viewing and exploring table data.
 * Uses TableEditor from @hands/editor with tRPC for type-safe CRUD.
 *
 * tableId format: "source.table" or just "table" (defaults to local source)
 */

import { createFileRoute } from "@tanstack/react-router";
import { TableEditor } from "@hands/editor/table-editor";
import { useTRPCReady } from "@/hooks/useTRPC";
import { useTableEditorProvider } from "@/hooks/useTableEditorProvider";
import { useState, useCallback } from "react";

export const Route = createFileRoute("/_notebook/tables/$tableId")({
  component: TablePage,
});

function TablePage() {
  const { tableId } = Route.useParams();
  const { ready, isLoading } = useTRPCReady();

  // Parse tableId - format can be "source.table" or just "table"
  const [source, table] = tableId.includes(".")
    ? tableId.split(".", 2)
    : ["local", tableId];

  // Sort state (passed to data provider)
  const [sortColumn, setSortColumn] = useState<string | undefined>(undefined);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  // Handle sort changes from TableEditor
  const handleSortChange = useCallback(
    (column: string | null, direction: "asc" | "desc") => {
      setSortColumn(column ?? undefined);
      setSortDirection(direction);
    },
    []
  );

  // Create data provider with current sort state
  const dataProvider = useTableEditorProvider({
    source,
    table,
    sort: sortColumn,
    sortDirection,
  });

  // Wait for runtime connection before rendering tRPC-dependent components
  if (!ready) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        {isLoading ? "Connecting to runtime..." : "Waiting for runtime..."}
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-background">
      <TableEditor
        dataProvider={dataProvider}
        tableName={table}
        className="flex-1"
        editable={true}
        onSortChange={handleSortChange}
      />
    </div>
  );
}
