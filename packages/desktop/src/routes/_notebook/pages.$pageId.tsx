import { PageEditor } from "@/components/page-editor/PageEditor";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_notebook/pages/$pageId")({
  component: PageView,
});

function PageView() {
  const { pageId } = Route.useParams();
  return <PageEditor pageId={pageId} className="h-full" />;
}
