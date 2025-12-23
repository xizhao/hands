/**
 * Index route - Content area for the home/index page
 *
 * With the Arc-style layout, the UnifiedSidebar is always visible in the
 * left sidebar. The content area shows:
 * - Loading state while initializing
 * - Empty workbook state (getting started) when no content exists
 * - Empty state prompting user to select something from sidebar
 */

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
  const pages = manifest?.pages ?? [];
  const pageCount = pages.length;

  // Still loading: no manifest yet OR db still booting (unless we have blocks to show)
  const isLoading = !manifest || isStarting || isDbBooting;

  // Has content: blocks, sources, or pages exist
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
    // File import is now handled via the sidebar chat
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

  // Case 3: Has content - content area shows prompt to select from sidebar
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center text-muted-foreground/60">
        <p className="text-sm">Select a page, table, or source from the sidebar</p>
      </div>
    </div>
  );
}
