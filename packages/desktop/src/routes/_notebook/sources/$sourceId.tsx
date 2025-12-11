/**
 * Source Viewer Route - /sources/:sourceId
 *
 * Shows source details, sync status, and allows manual sync.
 */

import { createFileRoute } from "@tanstack/react-router";
import { SourceViewer } from "@/components/SourceViewer";

export const Route = createFileRoute("/_notebook/sources/$sourceId")({
  component: SourceViewerPage,
});

function SourceViewerPage() {
  const { sourceId } = Route.useParams();

  return (
    <div className="h-full flex flex-col bg-background">
      <SourceViewer sourceId={sourceId} />
    </div>
  );
}
