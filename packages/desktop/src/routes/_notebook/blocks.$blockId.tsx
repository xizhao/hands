import { createFileRoute } from "@tanstack/react-router";
import { EditorSandbox } from "@/components/Notebook/editor/EditorSandbox";

export const Route = createFileRoute("/_notebook/blocks/$blockId")({
  component: BlockView,
});

function BlockView() {
  const { blockId } = Route.useParams();
  return <EditorSandbox blockId={blockId} className="h-full" />;
}
