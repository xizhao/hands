import { NotebookSidebar } from "@/components/sidebar/NotebookSidebar";
import { EmptyWorkbookState } from "@/components/workbook/EmptyWorkbookState";
import { useChatState } from "@/hooks/useChatState";
import { useRuntimeState } from "@/hooks/useRuntimeState";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_notebook/")({
  component: IndexPage,
});

function IndexPage() {
  const {
    manifest,
    schema: dbSchema,
    isFullyReady,
    isDbBooting,
    isStarting,
  } = useRuntimeState();
  const chatState = useChatState();

  const tableCount = dbSchema?.length ?? 0;
  const manifestTableCount = manifest?.tables?.length ?? 0;
  const blockCount = manifest?.blocks?.length ?? 0;
  const sourceCount = manifest?.sources?.length ?? 0;
  const pageCount = manifest?.pages?.length ?? 0;

  // Still loading: no manifest yet OR db still booting (unless we have blocks to show)
  const isLoading = !manifest || isStarting || isDbBooting;

  // Has content: blocks, sources, or pages exist (can show sidebar even if db loading)
  const hasContent = blockCount > 0 || sourceCount > 0 || pageCount > 0;

  // Show getting started ONLY when fully ready AND everything is empty
  const showGettingStarted =
    isFullyReady &&
    manifestTableCount === 0 &&
    tableCount === 0 &&
    blockCount === 0 &&
    sourceCount === 0 &&
    pageCount === 0;

  const handleImportFile = () => {
    // TODO: Trigger file input
  };

  // Case 1: Still loading and no content to show - full page loader
  if (isLoading && !hasContent) {
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

  // Case 2: Everything loaded and empty - show get started
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

  // Case 3: Has content (or db still loading with content) - show sidebar
  // The sidebar handles its own loading states for the DB section
  return (
    <div className="flex-1 flex items-start justify-center overflow-y-auto">
      <div className="p-4 pt-8">
        <NotebookSidebar collapsed={false} fullWidth />
      </div>
    </div>
  );
}
