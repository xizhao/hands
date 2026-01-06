/**
 * Table Route - /tables/:tableId
 *
 * Displays a table in the sheet editor.
 */

import { createFileRoute } from "@tanstack/react-router";
import { SheetTab } from "@/components/domain/tabs/SheetTab";
import { trpc } from "@/lib/trpc";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/_notebook/tables/$tableId")({
  component: TablePage,
});

function TablePage() {
  const { tableId } = Route.useParams();

  // Fetch domain data for the table
  const { data: domainsData, isLoading } = trpc.domains.list.useQuery();
  const domains = domainsData?.domains ?? [];
  const domain = domains.find((d) => d.id === tableId);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!domain) {
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
      <SheetTab key={tableId} domain={domain} />
    </div>
  );
}
