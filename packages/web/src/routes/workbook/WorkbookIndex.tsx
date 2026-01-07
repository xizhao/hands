/**
 * Workbook Index Route
 *
 * Default content when no page/table is selected.
 * Redirects to first page/table if available, otherwise shows empty state.
 */

import { EmptyWorkbookState, normalizePageId } from "@hands/app";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { trpc } from "../../lib/trpc";
import { FileText, Table2 } from "lucide-react";

export default function WorkbookIndex() {
  const navigate = useNavigate();
  const { workbookId } = useParams({ from: "/w/$workbookId" });
  const hasRedirected = useRef(false);

  // Fetch pages - workbookId in query input scopes cache per workbook
  const { data: pagesData, isLoading: pagesLoading, error: pagesError } = trpc.pages.list.useQuery(
    { workbookId },
    { enabled: !!workbookId, refetchInterval: 500 }
  );
  const pages = pagesData?.pages ?? [];

  // Fetch tables - workbookId in query input scopes cache per workbook
  const { data: tablesData, isLoading: tablesLoading, error: tablesError } = trpc.tables.list.useQuery(
    { workbookId },
    { enabled: !!workbookId, refetchInterval: 500 }
  );
  const tables = tablesData?.tables ?? [];

  // Still loading
  const isLoading = pagesLoading || tablesLoading;

  // Has content
  const hasContent = pages.length > 0 || tables.length > 0;

  // Show getting started when loaded and empty
  const showGettingStarted = !isLoading && !hasContent;

  // Debug logging
  useEffect(() => {
    console.log("[WorkbookIndex] State:", {
      isLoading,
      pagesLoading,
      tablesLoading,
      pagesCount: pages.length,
      tablesCount: tables.length,
      pagesError: pagesError?.message,
      tablesError: tablesError?.message,
      hasRedirected: hasRedirected.current,
    });
  }, [isLoading, pagesLoading, tablesLoading, pages.length, tables.length, pagesError, tablesError]);

  // Redirect to first page or table when content is loaded
  useEffect(() => {
    if (isLoading || hasRedirected.current) return;

    // Redirect to first page if available
    if (pages.length > 0) {
      hasRedirected.current = true;
      // Pages have `path` property - normalize to page ID
      const pageId = normalizePageId(pages[0].path);
      console.log("[WorkbookIndex] Redirecting to page:", pageId);
      navigate({
        to: "/w/$workbookId/pages/$pageId",
        params: { workbookId, pageId },
        replace: true,
      });
      return;
    }

    // Otherwise redirect to first table if available
    if (tables.length > 0) {
      hasRedirected.current = true;
      // Tables use `id` for navigation
      console.log("[WorkbookIndex] Redirecting to table:", tables[0].id);
      navigate({
        to: "/w/$workbookId/tables/$tableId",
        params: { workbookId, tableId: tables[0].id },
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
        <EmptyWorkbookState onImportFile={handleImportFile} chatExpanded={false} />
      </div>
    );
  }

  // Case 3: Has content but redirect pending - show loading to avoid flash
  return (
    <div className="h-full flex items-center justify-center">
      <div className="space-y-3 w-48">
        <div className="h-3 bg-muted/50 rounded animate-pulse" />
        <div className="h-3 bg-muted/50 rounded animate-pulse w-3/4" />
      </div>
    </div>
  );
}
