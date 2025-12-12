import { createFileRoute } from "@tanstack/react-router";
import { EditorSandbox } from "@/components/Notebook/editor/EditorSandbox";

export const Route = createFileRoute("/_notebook/blocks/$blockId")({
  component: BlockView,
});

function BlockView() {
  const { blockId } = Route.useParams();
  // Use blockId as the pageId for the sandbox - blocks are just a type of page
  return <EditorSandbox pageId={blockId} className="h-full" />;
}
