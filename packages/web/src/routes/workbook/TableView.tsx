/**
 * Table View Route
 *
 * Displays a table in the sheet editor.
 */

import { SheetTab, LoadingState } from "@hands/app";
import { getRouteApi } from "@tanstack/react-router";
import { trpc } from "../../lib/trpc";

const route = getRouteApi("/w/$workbookId/tables/$tableId");

export default function TableView() {
  const { tableId } = route.useParams();

  // Fetch table data
  const { data: tablesData, isLoading } = trpc.tables.list.useQuery();
  const tables = tablesData?.tables ?? [];
  const table = tables.find((t) => t.id === tableId);

  if (isLoading) {
    return <LoadingState />;
  }

  if (!table) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <p className="text-lg font-medium">Table not found</p>
          <p className="text-sm mt-1">Table "{tableId}" doesn't exist</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full">
      <SheetTab key={tableId} domain={table} />
    </div>
  );
}
