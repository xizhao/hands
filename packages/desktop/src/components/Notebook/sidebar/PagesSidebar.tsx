/**
 * DraftsSidebar - Navigation sidebar for notebook drafts and sources
 *
 * Features:
 * - Drafts section with list of notebook drafts
 * - Sources section with database tables
 * - Collapsible sections with headers
 * - Add new draft button
 * - Router-based navigation
 */

import { useState, useMemo, useCallback } from "react";
import { useNavigate, useRouterState, useRouter } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { FileText, Plus, ChevronDown, ChevronRight, Search, X, Pin, PinOff, ChevronLeft } from "lucide-react";
import { Table, TreeStructure, SquaresFour, CaretLeft, CaretRight } from "@phosphor-icons/react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useDbSchema, useManifest, useActiveWorkbookId } from "@/hooks/useWorkbook";

interface DraftsSidebarProps {
  collapsed?: boolean;
  fullWidth?: boolean;
  onAddDraft?: () => void;
  /** Whether sidebar is pinned open */
  pinned?: boolean;
  /** Callback to toggle pinned state */
  onPinnedChange?: (pinned: boolean) => void;
}

interface Draft {
  id: string;
  title: string;
  route?: string;
  path?: string;
}

export function DraftsSidebar({ collapsed = false, fullWidth = false, onAddDraft, pinned = false, onPinnedChange }: DraftsSidebarProps) {
  const navigate = useNavigate();
  const router = useRouter();
  const routerState = useRouterState();
  // Get activePageId by parsing the current URL path
  const currentPath = routerState.location.pathname;
  const pageMatch = currentPath.match(/^\/page\/(.+)$/);
  const activePageId = pageMatch?.[1] ?? null;

  // Get all data from hooks (filesystem as source of truth via manifest)
  const activeWorkbookId = useActiveWorkbookId();
  const { data: manifest, isLoading: manifestLoading } = useManifest();
  const { data: schema, isLoading: sourcesLoading } = useDbSchema(activeWorkbookId);

  // All data from manifest (filesystem source of truth)
  const drafts: Draft[] = manifest?.pages ?? [];
  const blocks = manifest?.blocks ?? [];
  const blocksLoading = manifestLoading;

  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [draftsExpanded, setDraftsExpanded] = useState(true);
  const [sourcesExpanded, setSourcesExpanded] = useState(true);
  const [blocksExpanded, setBlocksExpanded] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // Filter drafts, sources, and blocks based on search query
  const filteredDrafts = useMemo(() => {
    if (!searchQuery.trim()) return drafts;
    const query = searchQuery.toLowerCase();
    return drafts.filter((draft) => draft.title.toLowerCase().includes(query));
  }, [drafts, searchQuery]);

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

  const handleAddDraft = () => {
    onAddDraft?.();
  };

  // Calculate magnetic zoom scale based on distance from hovered item
  const getScale = useCallback((index: number) => {
    if (hoveredIndex === null) return 1;
    const distance = Math.abs(index - hoveredIndex);
    if (distance === 0) return 1.06; // Hovered item - subtle
    if (distance === 1) return 1.02; // Adjacent items
    return 1; // Far items
  }, [hoveredIndex]);

  // Handle draft click - navigate to page route
  const handleDraftClick = useCallback((pageId: string) => {
    console.log("[sidebar] navigating to draft:", pageId);
    navigate({ to: "/page/$pageId", params: { pageId } });
  }, [navigate]);

  // Handle block click - navigate to block editor
  const handleBlockClick = useCallback((blockId: string) => {
    console.log("[sidebar] navigating to block:", blockId);
    navigate({ to: "/blocks/$blockId", params: { blockId } });
  }, [navigate]);

  if (collapsed) {
    return (
      <TooltipProvider delayDuration={0}>
        <div className="space-y-4">
          {/* Drafts section - collapsed */}
          <div className="space-y-0.5">
            {drafts.map((draft, index) => (
              <DraftItem
                key={draft.id}
                draft={draft}
                active={activePageId === draft.id}
                scale={getScale(index)}
                collapsed={true}
                onClick={() => handleDraftClick(draft.id)}
                onMouseEnter={() => setHoveredIndex(index)}
                onMouseLeave={() => setHoveredIndex(null)}
              />
            ))}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleAddDraft}
                  className="w-full flex items-center justify-center p-1.5 text-muted-foreground/60 hover:text-muted-foreground transition-all"
                >
                  <Plus className="h-3 w-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>Add draft</p>
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
                      <Table weight="duotone" className="h-3.5 w-3.5" />
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
                    <button
                      onClick={() => handleBlockClick(block.id)}
                      className="w-full flex items-center justify-center p-1.5 text-muted-foreground hover:text-foreground transition-all"
                    >
                      <SquaresFour weight="duotone" className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    <p>{block.title || block.id}</p>
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

  // Full-width responsive grid layout
  if (fullWidth) {
    return (
      <TooltipProvider delayDuration={0}>
        <div className="w-full max-w-4xl mx-auto">
          {/* Search Bar - centered at top */}
          <div className="relative max-w-md mb-6">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/70" />
            <input
              type="text"
              placeholder="Search pages, sources, blocks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-10 py-2 text-sm bg-muted/50 border border-border/70 rounded-lg placeholder:text-muted-foreground/60 focus:outline-none focus:border-border focus:ring-1 focus:ring-ring/20"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/70 hover:text-muted-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Responsive grid - 3 columns on wide, 2 on medium, 1 on narrow */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Drafts Column */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Drafts
                </h3>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={handleAddDraft}
                      className="p-1 text-muted-foreground/60 hover:text-muted-foreground hover:bg-accent rounded transition-colors"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Add draft</TooltipContent>
                </Tooltip>
              </div>
              <div className="space-y-0.5">
                {filteredDrafts.length > 0 ? (
                  filteredDrafts.map((draft, index) => (
                    <DraftItem
                      key={draft.id}
                      draft={draft}
                      active={activePageId === draft.id}
                      scale={getScale(index)}
                      collapsed={false}
                      onClick={() => handleDraftClick(draft.id)}
                      onMouseEnter={() => setHoveredIndex(index)}
                      onMouseLeave={() => setHoveredIndex(null)}
                    />
                  ))
                ) : searchQuery ? (
                  <div className="text-sm text-muted-foreground/70 py-2">No drafts found</div>
                ) : (
                  <div className="text-sm text-muted-foreground/70 py-2">No drafts yet</div>
                )}
              </div>
            </div>

            {/* Sources Column */}
            <div className="space-y-2">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Sources
              </h3>
              <div className="space-y-0.5">
                {sourcesLoading ? (
                  <div className="text-sm text-muted-foreground/70 py-2">Loading...</div>
                ) : filteredSources && filteredSources.length > 0 ? (
                  filteredSources.map((table) => (
                    <button
                      key={table.table_name}
                      className="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent/50 rounded-md transition-colors"
                    >
                      <Table weight="duotone" className="h-4 w-4 shrink-0" />
                      <span className="flex-1 truncate text-left">{table.table_name}</span>
                      <span className="text-xs text-muted-foreground/60">{table.columns?.length ?? 0} cols</span>
                    </button>
                  ))
                ) : searchQuery && schema && schema.length > 0 ? (
                  <div className="text-sm text-muted-foreground/70 py-2">No sources found</div>
                ) : (
                  <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground/70">
                    <TreeStructure weight="duotone" className="h-4 w-4" />
                    <span>No sources connected</span>
                  </div>
                )}
              </div>
            </div>

            {/* Blocks Column */}
            <div className="space-y-2">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Blocks
              </h3>
              <div className="space-y-0.5">
                {blocksLoading ? (
                  <div className="text-sm text-muted-foreground/70 py-2">Loading...</div>
                ) : filteredBlocks.length > 0 ? (
                  filteredBlocks.map((block) => (
                    <button
                      key={block.id}
                      onClick={() => handleBlockClick(block.id)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent/50 rounded-md transition-colors"
                    >
                      <SquaresFour weight="duotone" className="h-4 w-4 shrink-0" />
                      <span className="flex-1 truncate text-left">{block.title || block.id}</span>
                    </button>
                  ))
                ) : searchQuery && blocks.length > 0 ? (
                  <div className="text-sm text-muted-foreground/70 py-2">No blocks found</div>
                ) : (
                  <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground/70">
                    <SquaresFour weight="duotone" className="h-4 w-4" />
                    <span>No blocks created</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </TooltipProvider>
    );
  }

  // Narrow sidebar layout (when not fullWidth)
  return (
    <TooltipProvider delayDuration={0}>
      <div className="space-y-3 w-full">
        {/* Navigation Controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-0.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => router.history.back()}
                  className="p-1 text-muted-foreground/70 hover:text-foreground hover:bg-accent/50 rounded transition-colors disabled:opacity-30 disabled:pointer-events-none"
                >
                  <CaretLeft weight="bold" className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Back</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => router.history.forward()}
                  className="p-1 text-muted-foreground/70 hover:text-foreground hover:bg-accent/50 rounded transition-colors disabled:opacity-30 disabled:pointer-events-none"
                >
                  <CaretRight weight="bold" className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Forward</TooltipContent>
            </Tooltip>
          </div>
          {onPinnedChange && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => onPinnedChange(!pinned)}
                  className={cn(
                    "p-1 rounded transition-colors",
                    pinned
                      ? "text-foreground bg-accent/50"
                      : "text-muted-foreground/70 hover:text-foreground hover:bg-accent/50"
                  )}
                >
                  {pinned ? <Pin className="h-3.5 w-3.5" /> : <PinOff className="h-3.5 w-3.5" />}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {pinned ? "Unpin sidebar" : "Pin sidebar open"}
              </TooltipContent>
            </Tooltip>
          )}
        </div>

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

        {/* Drafts Section */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <button
              onClick={() => setDraftsExpanded(!draftsExpanded)}
              className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground/80 uppercase tracking-wider hover:text-muted-foreground transition-colors"
            >
              {draftsExpanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
              Drafts
            </button>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleAddDraft}
                  className="p-0.5 text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                >
                  <Plus className="h-3 w-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>Add draft</p>
              </TooltipContent>
            </Tooltip>
          </div>

          {draftsExpanded && (
            <div className="space-y-0">
              {filteredDrafts.map((draft, index) => (
                <DraftItem
                  key={draft.id}
                  draft={draft}
                  active={activePageId === draft.id}
                  scale={getScale(index)}
                  collapsed={false}
                  onClick={() => handleDraftClick(draft.id)}
                  onMouseEnter={() => setHoveredIndex(index)}
                  onMouseLeave={() => setHoveredIndex(null)}
                />
              ))}
              {filteredDrafts.length === 0 && searchQuery && (
                <div className="text-[11px] text-muted-foreground/70 py-1">
                  No drafts found
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
                    <Table weight="duotone" className="h-3.5 w-3.5 shrink-0" />
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
                    onClick={() => handleBlockClick(block.id)}
                    className={cn(
                      "w-full flex items-center gap-2 py-0.5 text-[13px] transition-all duration-150 origin-left group",
                      "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <SquaresFour weight="duotone" className="h-3.5 w-3.5 shrink-0" />
                    <span className="flex-1 truncate text-left">{block.title || block.id}</span>
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

interface DraftItemProps {
  draft: Draft;
  active: boolean;
  scale: number;
  collapsed: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

function DraftItem({
  draft,
  active,
  scale,
  collapsed,
  onClick,
  onMouseEnter,
  onMouseLeave,
}: DraftItemProps) {
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
          <p>{draft.title}</p>
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
      <span className="flex-1 truncate text-left">{draft.title}</span>
    </button>
  );
}

// Legacy alias for backwards compatibility
export const PagesSidebar = DraftsSidebar;
