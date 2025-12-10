/**
 * Block Editor Route - /blocks/:blockId
 *
 * Visual editor for a specific block.
 */

import { createRoute, Link, useParams } from "@tanstack/react-router";
import { notebookRoute } from "../../_notebook";
import { BlockEditor } from "@/components/BlockEditor";
import { ArrowLeft } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

export const blockEditorRoute = createRoute({
  getParentRoute: () => notebookRoute,
  path: "/blocks/$blockId",
  component: BlockEditorPage,
});

function BlockEditorPage() {
  const { blockId } = useParams({ from: "/_notebook/blocks/$blockId" });

  // Handle "new" as a special case
  const isNew = blockId === "new";

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Back link */}
      <div className="px-4 py-2 border-b bg-muted/30">
        <Link
          to="/blocks"
          className={cn(
            "inline-flex items-center gap-1.5 text-sm text-muted-foreground",
            "hover:text-foreground transition-colors"
          )}
        >
          <ArrowLeft weight="bold" className="h-3.5 w-3.5" />
          Back to Blocks
        </Link>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-hidden">
        {isNew ? (
          <NewBlockEditor />
        ) : (
          <BlockEditor
            blockId={blockId}
            onSave={() => {
              console.log("[BlockEditorPage] Saved block:", blockId);
            }}
          />
        )}
      </div>
    </div>
  );
}

/**
 * New block creation editor
 */
function NewBlockEditor() {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="text-center max-w-md">
        <h2 className="text-lg font-medium mb-2">Create New Block</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Enter a name for your new block to get started with the visual editor.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.target as HTMLFormElement;
            const name = (form.elements.namedItem("name") as HTMLInputElement).value;
            // TODO: Create block and navigate to editor
            console.log("[NewBlockEditor] Create block:", name);
          }}
          className="space-y-4"
        >
          <input
            type="text"
            name="name"
            placeholder="my-chart"
            pattern="[a-z][a-z0-9-]*"
            required
            className={cn(
              "w-full h-10 px-4 rounded-md border border-input bg-background text-sm",
              "focus:outline-none focus:ring-2 focus:ring-ring"
            )}
          />
          <p className="text-xs text-muted-foreground">
            Use lowercase letters, numbers, and hyphens only
          </p>
          <button
            type="submit"
            className={cn(
              "w-full h-10 rounded-md text-sm font-medium",
              "bg-primary text-primary-foreground hover:bg-primary/90",
              "transition-colors"
            )}
          >
            Create Block
          </button>
        </form>
      </div>
    </div>
  );
}
