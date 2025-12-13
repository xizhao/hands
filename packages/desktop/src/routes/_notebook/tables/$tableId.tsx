/**
 * Table Data Route - /tables/:tableId
 *
 * Full database browser for viewing and exploring table data.
 * Uses TanStack Table with virtualization for performance.
 */

import { createFileRoute } from "@tanstack/react-router"
import { DataBrowser } from "@/components/DataBrowser"

export const Route = createFileRoute("/_notebook/tables/$tableId")({
  component: TablePage,
})

function TablePage() {
  const { tableId } = Route.useParams()

  return (
    <div className="h-full flex flex-col bg-background">
      <DataBrowser tableName={tableId} className="flex-1" />
    </div>
  )
}
