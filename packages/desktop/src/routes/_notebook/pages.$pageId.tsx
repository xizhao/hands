import { createFileRoute } from "@tanstack/react-router";
import { PageEditorSandbox } from "@/components/Notebook/editor/PageEditorSandbox";

export const Route = createFileRoute("/_notebook/pages/$pageId")({
  component: PageView,
});

function PageView() {
  const { pageId } = Route.useParams();
  return <PageEditorSandbox pageId={pageId} className="h-full" />;
}
