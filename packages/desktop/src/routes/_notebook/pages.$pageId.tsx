import { PageEditorSandbox } from "@/components/workbook/editor/PageEditorSandbox";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_notebook/pages/$pageId")({
  component: PageView,
});

function PageView() {
  const { pageId } = Route.useParams();
  return <PageEditorSandbox pageId={pageId} className="h-full" />;
}
