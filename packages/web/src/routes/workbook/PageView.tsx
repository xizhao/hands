/**
 * Page View Route
 *
 * Displays a single page in the editor.
 * Wraps PageEditor with WebEditorProvider to enable LiveValue SQL queries.
 */

import { PageEditor } from "@hands/app";
import { getRouteApi } from "@tanstack/react-router";
import { WebEditorProvider } from "../../db/WebEditorProvider";

const route = getRouteApi("/w/$workbookId/pages/$pageId");

export default function PageView() {
  const { pageId } = route.useParams();

  return (
    <WebEditorProvider>
      <div className="h-full">
        <PageEditor key={pageId} pageId={pageId} className="h-full" />
      </div>
    </WebEditorProvider>
  );
}
