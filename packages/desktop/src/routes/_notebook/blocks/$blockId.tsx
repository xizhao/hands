/**
 * Block Editor Route - /blocks/:blockId
 *
 * Renders the block with a Plate-style floating toolbar overlay.
 */

import { createFileRoute } from "@tanstack/react-router";
import { BlockEditor } from "@/components/BlockEditor";

export const Route = createFileRoute("/_notebook/blocks/$blockId")({
  component: BlockEditorPage,
});

function BlockEditorPage() {
  const { blockId } = Route.useParams();

  return (
    <div className="h-full flex flex-col bg-background">
      <BlockEditor blockId={blockId} />
    </div>
  );
}
