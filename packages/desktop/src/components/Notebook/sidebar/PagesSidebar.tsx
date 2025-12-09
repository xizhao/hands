/**
 * PagesSidebar - Navigation sidebar for notebook pages and sources
 *
 * Features:
 * - Pages section with list of notebook pages
 * - Sources section with database tables
 * - Collapsible sections with headers
 * - Add new page button
 * - Router-based navigation
 */

import { useState, useCallback, useMemo } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { pageRoute } from "@/routes/_notebook/page.$pageId";
import { cn } from "@/lib/utils";
import { FileText, Plus, ChevronDown, ChevronRight, Search, X } from "lucide-react";
import { Table, TreeStructure, SquaresFour } from "@phosphor-icons/react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useUIStore } from "@/stores/ui";
import { useDbSchema, useDevServerRoutes } from "@/hooks/useWorkbook";

interface PagesSidebarProps {
  collapsed?: boolean;
  fullWidth?: boolean;
}

interface Page {
  id: string;
  title: string;
  icon?: string;
}

// Mock pages for now - will be replaced with real data
const MOCK_PAGES: Page[] = [
  { id: "1", title: "Getting Started" },
  { id: "2", title: "Data Analysis" },
  { id: "3", title: "SQL Queries" },
];

export function PagesSidebar({ collapsed = false, fullWidth = false }: PagesSidebarProps) {
  const navigate = useNavigate();
  const routerState = useRouterState();
  // Get activePageId by parsing the current URL path
  const currentPath = routerState.location.pathname;
  const pageMatch = currentPath.match(/^\/page\/(.+)$/);
  const activePageId = pageMatch?.[1] ?? null;

  const [pages] = useState<Page[]>(MOCK_PAGES);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [pagesExpanded, setPagesExpanded] = useState(true);
  const [sourcesExpanded, setSourcesExpanded] = useState(true);
  const [blocksExpanded, setBlocksExpanded] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // Get sources and blocks data
  const { activeWorkbookId } = useUIStore();
  const { data: schema, isLoading: sourcesLoading } = useDbSchema(activeWorkbookId);
  const { data: devServerRoutes, isLoading: blocksLoading } = useDevServerRoutes(activeWorkbookId);
  const blocks = devServerRoutes?.charts ?? [];

  // Filter pages, sources, and blocks based on search query
  const filteredPages = useMemo(() => {
    if (!searchQuery.trim()) return pages;
    const query = searchQuery.toLowerCase();
    return pages.filter((page) => page.title.toLowerCase().includes(query));
  }, [pages, searchQuery]);

  const filteredSources = useMemo(() => {
    if (!searchQuery.trim() || !schema) return schema;
    const query = searchQuery.toLowerCase();
    return schema.filter((table) => table.table_name.toLowerCase().includes(query));
  }, [schema, searchQuery]);

  const filteredBlocks = useMemo(() => {
    if (!searchQuery.trim()) return blocks;
    const query = searchQuery.toLowerCase();
    return blocks.filter((block) => block.title.toLowerCase().includes(query));
  }, [blocks, searchQuery]);

  const handleAddPage = () => {
    // TODO: Implement add page
    console.log("Add new page");
  };

  // Calculate magnetic zoom scale based on distance from hovered item
  const getScale = useCallback((index: number) => {
    if (hoveredIndex === null) return 1;
    const distance = Math.abs(index - hoveredIndex);
    if (distance === 0) return 1.06; // Hovered item - subtle
    if (distance === 1) return 1.02; // Adjacent items
    return 1; // Far items
  }, [hoveredIndex]);

  if (collapsed) {
    return (
      <TooltipProvider delayDuration={0}>
        <div className="space-y-4">
          {/* Pages section - collapsed */}
          <div className="space-y-0.5">
            {pages.map((page, index) => (
              <PageItem
                key={page.id}
                page={page}
                active={activePageId === page.id}
                scale={getScale(index)}
                collapsed={true}
                onClick={() => handlePageClick(page.id)}
                onMouseEnter={() => setHoveredIndex(index)}
                onMouseLeave={() => setHoveredIndex(null)}
              />
            ))}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleAddPage}
                  className="w-full flex items-center justify-center p-1.5 text-muted-foreground/60 hover:text-muted-foreground transition-all"
                >
                  <Plus className="h-3 w-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>Add page</p>
              </TooltipContent>
            </Tooltip>
          </div>

          {/* Sources section - collapsed */}
          {schema && schema.length > 0 && (
            <div className="space-y-0.5 pt-2 border-t border-border/50">
              {schema.slice(0, 3).map((table) => (
                <Tooltip key={table.table_name}>
                  <TooltipTrigger asChild>
                    <button className="w-full flex items-center justify-center p-1.5 text-muted-foreground hover:text-foreground transition-all">
                      <Table weight="duotone" className="h-3.5 w-3.5 text-blue-400" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    <p>{table.table_name}</p>
                  </TooltipContent>
                </Tooltip>
              ))}
              {schema.length > 3 && (
                <div className="text-[8px] text-muted-foreground/70 text-center">
                  +{schema.length - 3}
                </div>
              )}
            </div>
          )}

          {/* Blocks section - collapsed */}
          {blocks.length > 0 && (
            <div className="space-y-0.5 pt-2 border-t border-border/50">
              {blocks.slice(0, 3).map((block) => (
                <Tooltip key={block.id}>
                  <TooltipTrigger asChild>
                    <button className="w-full flex items-center justify-center p-1.5 text-muted-foreground hover:text-foreground transition-all">
                      <SquaresFour weight="duotone" className="h-3.5 w-3.5 text-amber-500" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    <p>{block.title}</p>
                  </TooltipContent>
                </Tooltip>
              ))}
              {blocks.length > 3 && (
                <div className="text-[8px] text-muted-foreground/70 text-center">
                  +{blocks.length - 3}
                </div>
              )}
            </div>
          )}
        </div>
      </TooltipProvider>
    );
  }

  // Handle page click - navigate to page route
  const handlePageClick = useCallback((pageId: string) => {
    console.log("[sidebar] navigating to page:", pageId);
    navigate({ to: pageRoute.to, params: { pageId } });
  }, [navigate]);

  return (
    <TooltipProvider delayDuration={0}>
      <div className={cn("space-y-3", fullWidth ? "w-full" : "w-[140px]")}>
        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/70" />
          <input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-7 pr-7 py-1 text-[11px] bg-muted/50 border border-border/70 rounded-md placeholder:text-muted-foreground/60 focus:outline-none focus:border-border"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/70 hover:text-muted-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* Pages Section */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <button
              onClick={() => setPagesExpanded(!pagesExpanded)}
              className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground/80 uppercase tracking-wider hover:text-muted-foreground transition-colors"
            >
              {pagesExpanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
              Pages
            </button>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleAddPage}
                  className="p-0.5 text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                >
                  <Plus className="h-3 w-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>Add page</p>
              </TooltipContent>
            </Tooltip>
          </div>

          {pagesExpanded && (
            <div className="space-y-0">
              {filteredPages.map((page, index) => (
                <PageItem
                  key={page.id}
                  page={page}
                  active={activePageId === page.id}
                  scale={getScale(index)}
                  collapsed={false}
                  onClick={() => handlePageClick(page.id)}
                  onMouseEnter={() => setHoveredIndex(index)}
                  onMouseLeave={() => setHoveredIndex(null)}
                />
              ))}
              {filteredPages.length === 0 && searchQuery && (
                <div className="text-[11px] text-muted-foreground/70 py-1">
                  No pages found
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sources Section */}
        <div>
          <button
            onClick={() => setSourcesExpanded(!sourcesExpanded)}
            className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground/80 uppercase tracking-wider hover:text-muted-foreground transition-colors mb-1"
          >
            {sourcesExpanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            Sources
          </button>

          {sourcesExpanded && (
            <div className="space-y-0">
              {sourcesLoading ? (
                <div className="text-[11px] text-muted-foreground/70 py-1">
                  Loading...
                </div>
              ) : filteredSources && filteredSources.length > 0 ? (
                filteredSources.map((table) => (
                  <button
                    key={table.table_name}
                    className={cn(
                      "w-full flex items-center gap-2 py-0.5 text-[13px] transition-all duration-150 origin-left group",
                      "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Table weight="duotone" className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                    <span className="flex-1 truncate text-left">{table.table_name}</span>
                  </button>
                ))
              ) : searchQuery && schema && schema.length > 0 ? (
                <div className="text-[11px] text-muted-foreground/70 py-1">
                  No sources found
                </div>
              ) : (
                <div className="flex items-center gap-2 py-1 text-[11px] text-muted-foreground/70">
                  <TreeStructure weight="duotone" className="h-3.5 w-3.5" />
                  <span>No sources</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Blocks Section */}
        <div>
          <button
            onClick={() => setBlocksExpanded(!blocksExpanded)}
            className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground/80 uppercase tracking-wider hover:text-muted-foreground transition-colors mb-1"
          >
            {blocksExpanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            Blocks
          </button>

          {blocksExpanded && (
            <div className="space-y-0">
              {blocksLoading ? (
                <div className="text-[11px] text-muted-foreground/70 py-1">
                  Loading...
                </div>
              ) : filteredBlocks.length > 0 ? (
                filteredBlocks.map((block) => (
                  <button
                    key={block.id}
                    className={cn(
                      "w-full flex items-center gap-2 py-0.5 text-[13px] transition-all duration-150 origin-left group",
                      "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <SquaresFour weight="duotone" className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                    <span className="flex-1 truncate text-left">{block.title}</span>
                  </button>
                ))
              ) : searchQuery && blocks.length > 0 ? (
                <div className="text-[11px] text-muted-foreground/70 py-1">
                  No blocks found
                </div>
              ) : (
                <div className="flex items-center gap-2 py-1 text-[11px] text-muted-foreground/70">
                  <SquaresFour weight="duotone" className="h-3.5 w-3.5" />
                  <span>No blocks</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}

interface PageItemProps {
  page: Page;
  active: boolean;
  scale: number;
  collapsed: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

function PageItem({
  page,
  active,
  scale,
  collapsed,
  onClick,
  onMouseEnter,
  onMouseLeave,
}: PageItemProps) {
  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onClick}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
            style={{ transform: `scale(${scale})` }}
            className={cn(
              "w-full flex items-center justify-center p-1.5 transition-all duration-150 origin-left",
              active
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <FileText className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">
          <p>{page.title}</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <button
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{ transform: `scale(${scale})` }}
      className={cn(
        "w-full flex items-center gap-2 py-0.5 text-[13px] transition-all duration-150 origin-left group",
        active
          ? "text-foreground font-medium"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      <span className="flex-1 truncate text-left">{page.title}</span>
    </button>
  );
}
