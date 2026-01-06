/**
 * Page Route - /pages/:pageId
 *
 * Displays a single page in the editor.
 */

import { createFileRoute } from "@tanstack/react-router";
import { PageEditor } from "@/components/page-editor/PageEditor";

export const Route = createFileRoute("/_notebook/pages/$pageId")({
  component: PagePage,
});

function PagePage() {
  const { pageId } = Route.useParams();

  return (
    <div className="h-full">
      <PageEditor key={pageId} pageId={pageId} className="h-full" />
    </div>
  );
}
