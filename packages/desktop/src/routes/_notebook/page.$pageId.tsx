import { createRoute } from "@tanstack/react-router";
import { WorkbookEditor } from "@/components/Notebook/editor/WorkbookEditor";
import { notebookRoute } from "../_notebook";

export const pageRoute = createRoute({
  getParentRoute: () => notebookRoute,
  path: "/page/$pageId",
  component: PageView,
});

function PageView() {
  // Note: pageId is available via pageRoute.useParams() if needed
  // const { pageId } = pageRoute.useParams();
  return <WorkbookEditor />;
}
