/**
 * Source Doc Route - /sources/:sourceId
 *
 * Minimalist document-editing experience for source specs.
 * Feels like editing a doc with a small status toolbar.
 */

import { createFileRoute } from "@tanstack/react-router";
import { SourceDocEditor } from "@/components/SourceDocEditor";

export const Route = createFileRoute("/_notebook/sources/$sourceId")({
  component: SourceDocPage,
});

function SourceDocPage() {
  const { sourceId } = Route.useParams();

  return (
    <div className="h-full flex flex-col bg-background">
      <SourceDocEditor sourceId={sourceId} />
    </div>
  );
}
