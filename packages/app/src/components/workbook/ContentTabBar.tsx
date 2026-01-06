/**
 * ContentTabBar - Google Sheets-style bottom tabs
 *
 * Layout: [+] [≡] | tabs... | [<] [>]
 * - Plus button for adding new pages/tables
 * - List button to show all pages/tables
 * - Tabs in the middle (non-scrollable, controlled by arrows)
 * - Arrow buttons for carousel navigation when tabs overflow
 * - Fade gradients on edges
 */

import { CaretLeft, CaretRight, List, Plus } from "@phosphor-icons/react";
import { useParams, useRouter } from "@tanstack/react-router";
import { FileText, Table2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useNeedsTrafficLightOffset } from "@/hooks/useFullscreen";
import { useSidebarMode } from "@/hooks/useNavState";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { getPageIdFromPath } from "@/types/routes";

export function ContentTabBar() {
  const router = useRouter();
  const needsTrafficLightOffset = useNeedsTrafficLightOffset();
  const { mode: sidebarMode } = useSidebarMode();
  const isFloating = sidebarMode === "floating";

  // Get current page/table from router params
  const params = useParams({ strict: false });
  const currentPageId = (params as { pageId?: string }).pageId;
  const currentTableId = (params as { tableId?: string }).tableId;

  // Tab scroll state
  const tabsContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // Fetch pages
  const { data: pagesData, isLoading: pagesLoading } = trpc.pages.list.useQuery();
  const pages = pagesData?.pages ?? [];

  // Fetch tables (domains)
  const { data: domainsData, isLoading: domainsLoading } = trpc.domains.list.useQuery();
  const tables = domainsData?.domains ?? [];

  // tRPC utils for cache invalidation
  const utils = trpc.useUtils();

  // Create mutations
  const createPage = trpc.pages.create.useMutation({
    onSuccess: (result) => {
      utils.pages.list.invalidate();
      router.navigate({
        to: "/pages/$pageId",
        params: { pageId: result.pageId },
      });
    },
  });

  const createDomain = trpc.domains.create.useMutation({
    onSuccess: (result) => {
      utils.domains.list.invalidate();
      router.navigate({
        to: "/tables/$tableId",
        params: { tableId: result.domainId },
      });
    },
  });

  const isLoading = pagesLoading || domainsLoading;

  // Check scroll state
  const updateScrollState = useCallback(() => {
    const container = tabsContainerRef.current;
    if (!container) return;

    const { scrollLeft, scrollWidth, clientWidth } = container;
    setCanScrollLeft(scrollLeft > 0);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 1);
  }, []);

  // Update scroll state on mount and resize
  useEffect(() => {
    updateScrollState();
    const container = tabsContainerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver(updateScrollState);
    resizeObserver.observe(container);

    return () => resizeObserver.disconnect();
  }, [updateScrollState, pages, tables]);

  // Scroll handlers
  const scrollLeft = useCallback(() => {
    const container = tabsContainerRef.current;
    if (!container) return;
    container.scrollBy({ left: -150, behavior: "smooth" });
    setTimeout(updateScrollState, 300);
  }, [updateScrollState]);

  const scrollRight = useCallback(() => {
    const container = tabsContainerRef.current;
    if (!container) return;
    container.scrollBy({ left: 150, behavior: "smooth" });
    setTimeout(updateScrollState, 300);
  }, [updateScrollState]);

  // Handle new page creation
  const handleNewPage = () => {
    const pageId = `page-${Date.now()}`;
    createPage.mutate({ pageId });
  };

  // Handle new table creation
  const handleNewTable = () => {
    const tableName = `table_${Date.now()}`;
    createDomain.mutate({ name: tableName });
  };

  // Navigate to page
  const handlePageClick = (pageId: string) => {
    router.navigate({
      to: "/pages/$pageId",
      params: { pageId },
    });
  };

  // Navigate to table
  const handleTableClick = (tableId: string) => {
    router.navigate({
      to: "/tables/$tableId",
      params: { tableId },
    });
  };

  // Get page title
  const getPageTitle = (page: (typeof pages)[number]) => {
    if ("title" in page && typeof page.title === "string") {
      return page.title;
    }
    if ("compiled" in page && page.compiled?.meta?.title) {
      return page.compiled.meta.title;
    }
    return getPageIdFromPath(page.path);
  };

  const hasOverflow = canScrollLeft || canScrollRight;

  if (isLoading) {
    return (
      <div
        className={cn(
          "h-full flex items-end bg-surface",
          isFloating && needsTrafficLightOffset && "pl-[72px]",
        )}
      >
        <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground">
          <Spinner size="sm" />
          <span>Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "h-full flex items-end bg-surface",
        isFloating && needsTrafficLightOffset && "pl-[72px]",
      )}
    >
      {/* Left controls: + and list */}
      <div className="flex items-end shrink-0 gap-0.5 pr-1">
        {/* Add button */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                "flex items-center justify-center w-7 h-7 rounded-b-md",
                "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                "transition-colors",
              )}
            >
              <Plus weight="bold" className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[140px]">
            <DropdownMenuItem onClick={handleNewPage} disabled={createPage.isPending}>
              <FileText className="h-4 w-4 mr-2 text-blue-500" />
              <span className="text-sm">New Page</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleNewTable} disabled={createDomain.isPending}>
              <Table2 className="h-4 w-4 mr-2 text-emerald-500" />
              <span className="text-sm">New Table</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* List all button */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                "flex items-center justify-center w-7 h-7 rounded-b-md",
                "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                "transition-colors",
              )}
            >
              <List weight="bold" className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[200px] max-h-[300px] overflow-y-auto">
            {pages.length > 0 && (
              <>
                <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Pages</div>
                {pages.map((page) => {
                  const pageId = getPageIdFromPath(page.path);
                  const isActive = currentPageId === pageId;
                  return (
                    <DropdownMenuItem
                      key={page.path}
                      onClick={() => handlePageClick(pageId)}
                      className={cn(isActive && "bg-accent")}
                    >
                      <FileText className="h-4 w-4 mr-2 text-blue-500" />
                      <span className="truncate">{getPageTitle(page)}</span>
                    </DropdownMenuItem>
                  );
                })}
              </>
            )}
            {tables.length > 0 && (
              <>
                {pages.length > 0 && <DropdownMenuSeparator />}
                <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Tables</div>
                {tables.map((table) => {
                  const isActive = currentTableId === table.id;
                  const displayName = table.name
                    .split("_")
                    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                    .join(" ");
                  return (
                    <DropdownMenuItem
                      key={table.id}
                      onClick={() => handleTableClick(table.id)}
                      className={cn(isActive && "bg-accent")}
                    >
                      <Table2 className="h-4 w-4 mr-2 text-emerald-500" />
                      <span className="truncate">{displayName}</span>
                    </DropdownMenuItem>
                  );
                })}
              </>
            )}
            {pages.length === 0 && tables.length === 0 && (
              <div className="px-2 py-3 text-sm text-muted-foreground text-center">
                No pages or tables yet
              </div>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Tabs container with fade gradients */}
      <div className="flex-1 min-w-0 relative">
        {/* Left fade gradient */}
        {canScrollLeft && (
          <div className="absolute left-0 top-0 bottom-0 w-6 bg-gradient-to-r from-muted/50 to-transparent z-10 pointer-events-none" />
        )}

        {/* Tabs */}
        <div
          ref={tabsContainerRef}
          className="h-full flex items-stretch overflow-x-hidden"
          onScroll={updateScrollState}
        >
          {/* Page tabs */}
          {pages.map((page) => {
            const pageId = getPageIdFromPath(page.path);
            const isActive = currentPageId === pageId;
            const title = getPageTitle(page);

            return (
              <TabItem
                key={page.path}
                label={title}
                icon={FileText}
                isActive={isActive}
                iconColor="text-blue-500"
                onClick={() => handlePageClick(pageId)}
              />
            );
          })}

          {/* Table tabs */}
          {tables.map((table) => {
            const isActive = currentTableId === table.id;
            const displayName = table.name
              .split("_")
              .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
              .join(" ");

            return (
              <TabItem
                key={table.id}
                label={displayName}
                icon={Table2}
                isActive={isActive}
                iconColor="text-emerald-500"
                onClick={() => handleTableClick(table.id)}
              />
            );
          })}
        </div>

        {/* Right fade gradient */}
        {canScrollRight && (
          <div className="absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-muted/50 to-transparent z-10 pointer-events-none" />
        )}
      </div>

      {/* Right controls: carousel arrows (only when overflow) */}
      {hasOverflow && (
        <div className="flex items-stretch shrink-0 border-l border-border/30">
          <button
            onClick={scrollLeft}
            disabled={!canScrollLeft}
            className={cn(
              "flex items-center justify-center w-7 h-full",
              "transition-colors",
              canScrollLeft
                ? "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                : "text-muted-foreground/30 cursor-not-allowed",
            )}
          >
            <CaretLeft weight="bold" className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={scrollRight}
            disabled={!canScrollRight}
            className={cn(
              "flex items-center justify-center w-7 h-full",
              "transition-colors",
              canScrollRight
                ? "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                : "text-muted-foreground/30 cursor-not-allowed",
            )}
          >
            <CaretRight weight="bold" className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

// Individual tab item component
interface TabItemProps {
  label: string;
  icon: typeof FileText;
  isActive: boolean;
  iconColor: string;
  onClick: () => void;
}

function TabItem({ label, icon: Icon, isActive, iconColor, onClick }: TabItemProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onClick}
          className={cn(
            "relative flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap",
            "rounded-b-md",
            isActive
              ? [
                  "bg-background text-foreground",
                  "border-x border-b border-border/40",
                  "-mt-px", // overlap with content border above
                ]
              : [
                  "text-muted-foreground hover:text-foreground",
                  "hover:bg-muted/50",
                  "border-x border-b border-transparent",
                ],
          )}
        >
          <Icon className={cn("h-3 w-3 shrink-0", isActive && iconColor)} />
          <span className="truncate max-w-[100px]">{label}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}
