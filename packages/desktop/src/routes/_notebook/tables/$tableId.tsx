/**
 * Table Data Route - /tables/:tableId
 *
 * Full database browser for viewing and exploring table data.
 * Uses glide-data-grid with tRPC for type-safe CRUD.
 *
 * tableId format: "source.table" or just "table" (defaults to local source)
 */

import { createFileRoute } from "@tanstack/react-router";
import { DataBrowser } from "@/components/DataBrowser";
import { useTRPCReady } from "@/hooks/useTRPC";

export const Route = createFileRoute("/_notebook/tables/$tableId")({
  component: TablePage,
});

function TablePage() {
  const { tableId } = Route.useParams();
  const { ready, isLoading } = useTRPCReady();

  // Parse tableId - format can be "source.table" or just "table"
  const [source, table] = tableId.includes(".") ? tableId.split(".", 2) : ["local", tableId];

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
      <DataBrowser source={source} table={table} className="flex-1" editable={true} />
    </div>
  );
}
