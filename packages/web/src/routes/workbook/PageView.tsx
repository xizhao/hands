/**
 * Page View Route
 *
 * Displays a single page in the editor.
 */

import { PageEditor } from "@hands/app";
import { getRouteApi } from "@tanstack/react-router";

const route = getRouteApi("/w/$workbookId/pages/$pageId");

export default function PageView() {
  const { pageId } = route.useParams();

  return (
    <div className="h-full">
      <PageEditor key={pageId} pageId={pageId} className="h-full" />
    </div>
  );
}
