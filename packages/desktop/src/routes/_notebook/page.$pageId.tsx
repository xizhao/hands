import { createFileRoute } from "@tanstack/react-router";
import { WorkbookEditor } from "@/components/Notebook/editor/WorkbookEditor";

export const Route = createFileRoute("/_notebook/page/$pageId")({
  component: PageView,
});

function PageView() {
  // Note: pageId is available via Route.useParams() if needed
  // const { pageId } = Route.useParams();
  return <WorkbookEditor />;
}
