import { createFileRoute } from "@tanstack/react-router";
import { NotebookSidebar } from "@/components/Notebook/sidebar/NotebookSidebar";
import { EmptyWorkbookState } from "@/components/Notebook/EmptyWorkbookState";
import { useManifest, useDbSchema, useActiveWorkbookId } from "@/hooks/useWorkbook";
import { useChatState } from "@/hooks/useChatState";

export const Route = createFileRoute("/_notebook/")({
  component: IndexPage,
});

function IndexPage() {
  const activeWorkbookId = useActiveWorkbookId();
  const { data: manifest } = useManifest();
  const { data: dbSchema } = useDbSchema(activeWorkbookId);
  const chatState = useChatState();

  const tableCount = dbSchema?.length ?? 0;
  const manifestTableCount = manifest?.tables?.length ?? 0;
  const blockCount = manifest?.blocks?.length ?? 0;

  // Show getting started when manifest is loaded but empty (no tables or blocks)
  const showGettingStarted = manifest !== undefined && manifestTableCount === 0 && tableCount === 0 && blockCount === 0;

  const handleImportFile = () => {
    // TODO: Trigger file input
  };

  if (manifest === undefined) {
    // Loading state
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="space-y-3 w-48">
          <div className="h-3 bg-muted/50 rounded animate-pulse" />
          <div className="h-3 bg-muted/50 rounded animate-pulse w-3/4" />
          <div className="h-3 bg-muted/50 rounded animate-pulse w-1/2" />
        </div>
      </div>
    );
  }

  if (showGettingStarted) {
    return (
      <div className="flex-1 flex items-start justify-center overflow-y-auto">
        <EmptyWorkbookState
          onImportFile={handleImportFile}
          chatExpanded={chatState.chatExpanded}
        />
      </div>
    );
  }

  return (
    <div className="flex-1 flex items-start justify-center overflow-y-auto">
      <div className="p-4 pt-8">
        <NotebookSidebar collapsed={false} fullWidth />
      </div>
    </div>
  );
}
