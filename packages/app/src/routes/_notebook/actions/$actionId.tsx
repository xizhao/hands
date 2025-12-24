/**
 * Action Detail Route - /actions/:actionId
 *
 * Shows action details, run history, and allows manual execution.
 */

import { createFileRoute } from "@tanstack/react-router";
import { ActionDetailPanel } from "@/components/ActionDetailPanel";

export const Route = createFileRoute("/_notebook/actions/$actionId")({
  component: ActionDetailPage,
});

function ActionDetailPage() {
  const { actionId } = Route.useParams();

  return (
    <div className="h-full flex flex-col bg-background">
      <ActionDetailPanel actionId={actionId} />
    </div>
  );
}
