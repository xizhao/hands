/**
 * Workbook Index Route
 *
 * Default content when no page/table is selected.
 * Redirects to first page/table if available, otherwise shows empty state.
 */

import { EmptyWorkbookState, useChatState, useRuntimeState } from "@hands/app";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useEffect } from "react";
import { trpc } from "../../lib/trpc";
import { FileText, Table2 } from "lucide-react";

export default function WorkbookIndex() {
  const { manifest, isFullyReady, isDbBooting, isStarting } = useRuntimeState();
  const chatState = useChatState();
  const navigate = useNavigate();
  const { workbookId } = useParams({ from: "/w/$workbookId" });

  // Fetch pages
  const { data: pagesData, isLoading: pagesLoading } = trpc.pages.list.useQuery();
  const pages = pagesData?.pages ?? [];

  // Fetch tables (domains)
  const { data: domainsData, isLoading: domainsLoading } = trpc.domains.list.useQuery(undefined, {
    refetchInterval: 2000,
  });
  const tables = domainsData?.domains ?? [];

  const blockCount = manifest?.blocks?.length ?? 0;

  // Still loading
  const isLoading = !manifest || isStarting || isDbBooting || pagesLoading || domainsLoading;

  // Has content
  const hasContent = pages.length > 0 || tables.length > 0 || blockCount > 0;

  // Show getting started ONLY when fully ready AND everything is empty
  const showGettingStarted = isFullyReady && !hasContent;

  // Redirect to first page or table when content is loaded
  useEffect(() => {
    if (isLoading) return;

    // Redirect to first page if available
    if (pages.length > 0) {
      navigate({
        to: "/w/$workbookId/pages/$pageId",
        params: { workbookId, pageId: pages[0].id },
        replace: true,
      });
      return;
    }

    // Otherwise redirect to first table if available
    if (tables.length > 0) {
      navigate({
        to: "/w/$workbookId/tables/$tableId",
        params: { workbookId, tableId: tables[0].name },
        replace: true,
      });
    }
  }, [isLoading, pages, tables, workbookId, navigate]);

  const handleImportFile = () => {
    // File import is handled via the sidebar chat
  };

  // Case 1: Still loading - show skeleton
  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
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
      <div className="h-full flex items-start justify-center overflow-y-auto">
        <EmptyWorkbookState onImportFile={handleImportFile} chatExpanded={chatState.chatExpanded} />
      </div>
    );
  }

  // Case 3: Has content - show welcome/selection prompt
  return (
    <div className="h-full flex items-center justify-center">
      <div className="text-center space-y-4 max-w-sm px-4">
        <div className="flex justify-center gap-3">
          <div className="p-3 rounded-lg bg-blue-500/10">
            <FileText className="h-6 w-6 text-blue-500" />
          </div>
          <div className="p-3 rounded-lg bg-emerald-500/10">
            <Table2 className="h-6 w-6 text-emerald-500" />
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">
            Select a page or table
          </p>
          <p className="text-sm text-muted-foreground">
            Choose from the tabs above, or click + to create something new.
          </p>
        </div>
      </div>
    </div>
  );
}
