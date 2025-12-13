/**
 * NotebookSidebar - Navigation sidebar with 2 columns: Blocks and Data
 *
 * Features:
 * - Blocks section with custom components (grouped by directory)
 * - Data section containing:
 *   - Unassociated Tables folder (tables not linked to any source)
 *   - Sources (expandable to show their associated tables)
 * - Collapsible sections with headers
 * - Router-based navigation
 * - Unified responsive layout (single view, responsive styling)
 */

import {
  ArrowsClockwise,
  CaretLeft,
  CaretRight,
  CircleNotch,
  Code,
  Copy,
  Database,
  Folder,
  FolderOpen,
  Key,
  Newspaper,
  Trash,
  Warning,
} from "@phosphor-icons/react";
import { useNavigate, useRouter } from "@tanstack/react-router";
import {
  ChevronDown,
  ChevronRight,
  MoreHorizontal,
  Pin,
  PinOff,
  Plus,
  Search,
  X,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useSourceManagement } from "@/hooks/useSources";
import { useRuntimeState, useRuntimePort } from "@/hooks/useRuntimeState";
import { cn } from "@/lib/utils";

interface NotebookSidebarProps {
  collapsed?: boolean;
  fullWidth?: boolean;
  /** Whether sidebar is pinned open */
  pinned?: boolean;
  /** Callback to toggle pinned state */
  onPinnedChange?: (pinned: boolean) => void;
  /** Callback when a dropdown menu opens/closes */
  onMenuOpenChange?: (open: boolean) => void;
}

// Map icon names to Phosphor icons for sources
const sourceIconMap: Record<string, React.ElementType> = {
  newspaper: Newspaper,
  code: Code,
};

function SourceIcon({ icon, className }: { icon?: string; className?: string }) {
  const Icon = icon && sourceIconMap[icon] ? sourceIconMap[icon] : Database;
  return <Icon weight="duotone" className={className} />;
}

// Shared list item styles - consistent across all views
const listItemStyles =
  "w-full flex items-center gap-2 px-2 py-1 text-sm text-muted-foreground hover:text-foreground hover:bg-accent/50 rounded-md transition-colors group";
const listItemIconStyles = "shrink-0 transition-colors";
const emptyStateStyles = "flex items-center gap-2 px-2 py-1 text-sm text-muted-foreground/60";

// Icon components with hover color
function BlockIcon({ className, empty }: { className?: string; empty?: boolean }) {
  return (
    <span
      className={cn(
        listItemIconStyles,
        empty ? "opacity-50" : "group-hover:text-blue-400",
        className,
      )}
    >
      &#x25A0;
    </span>
  );
}

function SourceItemIcon({ className, empty }: { className?: string; empty?: boolean }) {
  return (
    <span
      className={cn(
        listItemIconStyles,
        empty ? "opacity-50" : "group-hover:text-green-400",
        className,
      )}
    >
      &#x25B2;
    </span>
  );
}

function DataIcon({ className, empty }: { className?: string; empty?: boolean }) {
  return (
    <span
      className={cn(
        listItemIconStyles,
        empty ? "opacity-50" : "group-hover:text-purple-400",
        className,
      )}
    >
      &#x25CF;
    </span>
  );
}

// Reusable dropdown for item actions (copy, delete)
interface ItemActionsProps {
  onCopy?: () => void;
  onDelete?: () => void;
  copyLabel?: string;
  deleteLabel?: string;
  onOpenChange?: (open: boolean) => void;
}

function ItemActions({
  onCopy,
  onDelete,
  copyLabel = "Duplicate",
  deleteLabel = "Delete",
  onOpenChange,
}: ItemActionsProps) {
  return (
    <DropdownMenu onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          onClick={(e) => e.stopPropagation()}
          className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-accent transition-all"
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-32">
        {onCopy && (
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              onCopy();
            }}
          >
            <Copy weight="duotone" className="h-3.5 w-3.5 mr-2" />
            {copyLabel}
          </DropdownMenuItem>
        )}
        {onCopy && onDelete && <DropdownMenuSeparator />}
        {onDelete && (
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="text-destructive focus:text-destructive"
          >
            <Trash weight="duotone" className="h-3.5 w-3.5 mr-2" />
            {deleteLabel}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function NotebookSidebar({
  collapsed = false,
  fullWidth = false,
  pinned = false,
  onPinnedChange,
  onMenuOpenChange,
}: NotebookSidebarProps) {
  const navigate = useNavigate();
  const router = useRouter();

  // Consolidated runtime state - single source of truth
  const {
    workbookId: activeWorkbookId,
    manifest,
    schema,
    isStarting,
    isDbBooting,
  } = useRuntimeState();

  // Derived loading states
  const manifestLoading = !manifest && !!activeWorkbookId;
  const isDbLoading = isStarting || isDbBooting;

  // Source management hooks
  const { sources, availableSources, addSource, isAdding, syncSource, isSyncing, syncingSourceId } =
    useSourceManagement();

  // All data from manifest (filesystem source of truth)
  const blocks = manifest?.blocks ?? [];
  const blocksLoading = manifestLoading;

  const [blocksExpanded, setBlocksExpanded] = useState(true);
  const [dataExpanded, setDataExpanded] = useState(true);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set()); // Track expanded directories
  const [expandedSources, setExpandedSources] = useState<Set<string>>(new Set()); // Track expanded sources
  const [unassociatedExpanded, setUnassociatedExpanded] = useState(true); // Track unassociated tables folder

  // Toggle directory expansion
  const toggleDir = useCallback((dir: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(dir)) {
        next.delete(dir);
      } else {
        next.add(dir);
      }
      return next;
    });
  }, []);

  // Toggle source expansion
  const toggleSource = useCallback((sourceId: string) => {
    setExpandedSources((prev) => {
      const next = new Set(prev);
      if (next.has(sourceId)) {
        next.delete(sourceId);
      } else {
        next.add(sourceId);
      }
      return next;
    });
  }, []);

  // Build tree structure from blocks with parentDir
  const blockTree = useMemo(() => {
    const tree: Map<string, typeof blocks> = new Map();
    const rootBlocks: typeof blocks = [];

    for (const block of blocks) {
      const parentDir = block.parentDir || "";
      if (!parentDir) {
        rootBlocks.push(block);
      } else {
        if (!tree.has(parentDir)) {
          tree.set(parentDir, []);
        }
        tree.get(parentDir)?.push(block);
      }
    }

    return { rootBlocks, directories: tree };
  }, [blocks]);

  // Group tables by source - tables prefixed with source name belong to that source
  const { sourceTableMap, unassociatedTables } = useMemo(() => {
    const tableMap = new Map<string, string[]>(); // sourceId -> table names
    const unassociated: string[] = [];

    if (!schema) return { sourceTableMap: tableMap, unassociatedTables: unassociated };

    for (const table of schema) {
      const tableName = table.table_name;
      // Check if table is prefixed with any source name (e.g., "hackernews_stories" belongs to "hackernews" source)
      let matched = false;
      for (const source of sources) {
        const prefix = `${source.name.toLowerCase()}_`;
        if (
          tableName.toLowerCase().startsWith(prefix) ||
          tableName.toLowerCase() === source.name.toLowerCase()
        ) {
          if (!tableMap.has(source.id)) {
            tableMap.set(source.id, []);
          }
          tableMap.get(source.id)?.push(tableName);
          matched = true;
          break;
        }
      }
      if (!matched) {
        unassociated.push(tableName);
      }
    }

    return { sourceTableMap: tableMap, unassociatedTables: unassociated };
  }, [schema, sources]);
  const [searchQuery, setSearchQuery] = useState("");
  const [addSourceOpen, setAddSourceOpen] = useState(false);
  const [selectedSource, setSelectedSource] = useState<string | null>(null);

  // Get installed source names for filtering
  const installedSourceNames = sources.map((s) => s.name);
  const availableToAdd = availableSources.filter((s) => !installedSourceNames.includes(s.name));

  const handleAddSource = async (sourceName: string) => {
    setSelectedSource(sourceName);
    await addSource(sourceName);
    setSelectedSource(null);
    setAddSourceOpen(false);
  };

  // Filter sources and blocks based on search query
  const _filteredSources = useMemo(() => {
    if (!searchQuery.trim() || !schema) return schema;
    const query = searchQuery.toLowerCase();
    return schema.filter((table) => table.table_name.toLowerCase().includes(query));
  }, [schema, searchQuery]);

  const _filteredBlocks = useMemo(() => {
    if (!searchQuery.trim()) return blocks;
    const query = searchQuery.toLowerCase();
    return blocks.filter((block) => block.title.toLowerCase().includes(query));
  }, [blocks, searchQuery]);

  // Handle block click - navigate to block editor
  const handleBlockClick = useCallback(
    (blockId: string) => {
      console.log("[sidebar] navigating to block:", blockId);
      navigate({ to: "/blocks/$blockId", params: { blockId } });
    },
    [navigate],
  );

  // Handle source click - navigate to source viewer
  const handleSourceClick = useCallback(
    (sourceId: string) => {
      console.log("[sidebar] navigating to source:", sourceId);
      navigate({ to: "/sources/$sourceId", params: { sourceId } });
    },
    [navigate],
  );

  // Handle table click - navigate to table viewer
  const handleTableClick = useCallback(
    (tableId: string) => {
      console.log("[sidebar] navigating to table:", tableId);
      navigate({ to: "/tables/$tableId", params: { tableId } });
    },
    [navigate],
  );

  // Runtime port for API calls
  const runtimePort = useRuntimePort();

  // CRUD action handlers
  const handleCopyBlock = useCallback(
    async (blockId: string) => {
      if (!runtimePort) return;
      try {
        const res = await fetch(
          `http://localhost:${runtimePort}/workbook/blocks/${blockId}/duplicate`,
          {
            method: "POST",
          },
        );
        if (!res.ok) throw new Error("Failed to duplicate block");
        console.log("[sidebar] duplicated block:", blockId);
      } catch (err) {
        console.error("[sidebar] failed to duplicate block:", err);
      }
    },
    [runtimePort],
  );

  const handleDeleteBlock = useCallback(
    async (blockId: string) => {
      if (!runtimePort) return;
      try {
        const res = await fetch(`http://localhost:${runtimePort}/workbook/blocks/${blockId}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error("Failed to delete block");
        console.log("[sidebar] deleted block:", blockId);
        // Navigate away if we deleted the current block
        navigate({ to: "/" });
      } catch (err) {
        console.error("[sidebar] failed to delete block:", err);
      }
    },
    [runtimePort, navigate],
  );

  const handleCopySource = useCallback(
    async (sourceId: string) => {
      if (!runtimePort) return;
      try {
        const res = await fetch(
          `http://localhost:${runtimePort}/workbook/sources/${sourceId}/duplicate`,
          {
            method: "POST",
          },
        );
        if (!res.ok) throw new Error("Failed to duplicate source");
        console.log("[sidebar] duplicated source:", sourceId);
      } catch (err) {
        console.error("[sidebar] failed to duplicate source:", err);
      }
    },
    [runtimePort],
  );

  const handleDeleteSource = useCallback(
    async (sourceId: string) => {
      if (!runtimePort) return;
      try {
        const res = await fetch(`http://localhost:${runtimePort}/workbook/sources/${sourceId}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error("Failed to delete source");
        console.log("[sidebar] deleted source:", sourceId);
        navigate({ to: "/" });
      } catch (err) {
        console.error("[sidebar] failed to delete source:", err);
      }
    },
    [runtimePort, navigate],
  );

  const handleDeleteTable = useCallback(
    async (tableName: string) => {
      if (!runtimePort) return;
      try {
        const res = await fetch(`http://localhost:${runtimePort}/postgres/tables/${tableName}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error("Failed to delete table");
        console.log("[sidebar] deleted table:", tableName);
        navigate({ to: "/" });
      } catch (err) {
        console.error("[sidebar] failed to delete table:", err);
      }
    },
    [runtimePort, navigate],
  );

  if (collapsed) {
    return (
      <TooltipProvider delayDuration={0}>
        <div className="space-y-4">
          {/* Blocks section - collapsed */}
          {blocks.length > 0 && (
            <div className="space-y-0.5 pt-2 border-t border-border/50">
              {blocks.slice(0, 3).map((block) => (
                <Tooltip key={block.id}>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => handleBlockClick(block.id)}
                      className="w-full flex items-center justify-center p-1.5 text-muted-foreground hover:text-blue-400 transition-all"
                    >
                      <span className="text-sm">&#x25A0;</span>
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

          {/* Data section - collapsed (sources + tables) */}
          {(sources.length > 0 || (schema && schema.length > 0)) && (
            <div className="space-y-0.5 pt-2 border-t border-border/50">
              {/* Show sources first */}
              {sources.slice(0, 2).map((source) => (
                <Tooltip key={source.id}>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => handleSourceClick(source.id)}
                      className="w-full flex items-center justify-center p-1.5 text-muted-foreground hover:text-green-400 transition-all"
                    >
                      <span className="text-sm">&#x25B2;</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    <p>{source.title}</p>
                  </TooltipContent>
                </Tooltip>
              ))}
              {/* Show unassociated tables */}
              {unassociatedTables.slice(0, sources.length > 0 ? 1 : 3).map((tableName) => (
                <Tooltip key={tableName}>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => handleTableClick(tableName)}
                      className="w-full flex items-center justify-center p-1.5 text-muted-foreground hover:text-purple-400 transition-all"
                    >
                      <span className="text-sm">&#x25CF;</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    <p>{tableName}</p>
                  </TooltipContent>
                </Tooltip>
              ))}
              {sources.length + unassociatedTables.length > 3 && (
                <div className="text-[8px] text-muted-foreground/70 text-center">
                  +{sources.length + unassociatedTables.length - 3}
                </div>
              )}
            </div>
          )}
        </div>
      </TooltipProvider>
    );
  }

  // Unified responsive layout - same components, different layout based on fullWidth
  return (
    <TooltipProvider delayDuration={0}>
      <div className={cn("w-full", fullWidth && "max-w-4xl mx-auto")}>
        {/* Navigation Controls - only show in narrow mode */}
        {!fullWidth && (
          <div className="flex items-center justify-between mb-3">
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
                        : "text-muted-foreground/70 hover:text-foreground hover:bg-accent/50",
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
        )}

        {/* Search Bar */}
        <div className={cn("relative", fullWidth ? "max-w-md mb-6" : "mb-3")}>
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/70" />
          <input
            type="text"
            placeholder="Search blocks, sources..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-8 py-1.5 text-sm bg-muted/50 border border-border/70 rounded-md placeholder:text-muted-foreground/60 focus:outline-none focus:border-border focus:ring-1 focus:ring-ring/20"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/70 hover:text-muted-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Main content grid - 1 column narrow, 2 columns fullWidth */}
        <div className={cn(fullWidth ? "grid grid-cols-1 md:grid-cols-2 gap-6" : "space-y-3")}>
          {/* Blocks Section */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setBlocksExpanded(!blocksExpanded)}
                className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground/80 uppercase tracking-wider hover:text-muted-foreground transition-colors"
              >
                {blocksExpanded ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
                Blocks
              </button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className="p-0.5 text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                    title="New block"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">New block</TooltipContent>
              </Tooltip>
            </div>

            {blocksExpanded && (
              <div className="space-y-0">
                {blocksLoading ? (
                  <div className={emptyStateStyles}>Loading...</div>
                ) : blocks.length > 0 ? (
                  <>
                    {/* Directories */}
                    {Array.from(blockTree.directories.keys())
                      .sort()
                      .map((dir) => {
                        const isExpanded = expandedDirs.has(dir);
                        const dirBlocks = blockTree.directories.get(dir) || [];
                        const filteredDirBlocks = searchQuery
                          ? dirBlocks.filter((b) =>
                              b.title.toLowerCase().includes(searchQuery.toLowerCase()),
                            )
                          : dirBlocks;

                        if (searchQuery && filteredDirBlocks.length === 0) return null;

                        return (
                          <div key={dir}>
                            <button
                              onClick={() => toggleDir(dir)}
                              className={cn(listItemStyles, "group")}
                            >
                              {isExpanded ? (
                                <FolderOpen
                                  weight="duotone"
                                  className="h-4 w-4 shrink-0 text-amber-500"
                                />
                              ) : (
                                <Folder
                                  weight="duotone"
                                  className="h-4 w-4 shrink-0 text-amber-500"
                                />
                              )}
                              <span className="flex-1 truncate text-left">{dir}</span>
                              <span className="text-xs text-muted-foreground/60">
                                {filteredDirBlocks.length}
                              </span>
                            </button>
                            {(isExpanded || searchQuery) && (
                              <div className="ml-4 border-l border-border/50 pl-2">
                                {filteredDirBlocks.map((block) => (
                                  <div key={block.id} className={listItemStyles}>
                                    <BlockIcon />
                                    <button
                                      onClick={() => handleBlockClick(block.id)}
                                      className="flex-1 truncate text-left hover:underline"
                                    >
                                      {block.title || block.id}
                                    </button>
                                    <ItemActions
                                      onCopy={() => handleCopyBlock(block.id)}
                                      onDelete={() => handleDeleteBlock(block.id)}
                                      onOpenChange={onMenuOpenChange}
                                    />
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    {/* Root blocks */}
                    {(searchQuery
                      ? blockTree.rootBlocks.filter((b) =>
                          b.title.toLowerCase().includes(searchQuery.toLowerCase()),
                        )
                      : blockTree.rootBlocks
                    ).map((block) => (
                      <div key={block.id} className={listItemStyles}>
                        <BlockIcon />
                        <button
                          onClick={() => handleBlockClick(block.id)}
                          className="flex-1 truncate text-left hover:underline"
                        >
                          {block.title || block.id}
                        </button>
                        <ItemActions
                          onCopy={() => handleCopyBlock(block.id)}
                          onDelete={() => handleDeleteBlock(block.id)}
                          onOpenChange={onMenuOpenChange}
                        />
                      </div>
                    ))}
                  </>
                ) : (
                  <div className={emptyStateStyles}>
                    <BlockIcon empty />
                    <span>No blocks</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Data Section - Contains Sources (with their tables) and Unassociated Tables */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setDataExpanded(!dataExpanded)}
                className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground/80 uppercase tracking-wider hover:text-muted-foreground transition-colors"
              >
                {dataExpanded ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
                Data
              </button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setAddSourceOpen(true)}
                    className="p-0.5 text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">Add source</TooltipContent>
              </Tooltip>
            </div>

            {/* Add Source Dialog */}
            <Dialog open={addSourceOpen} onOpenChange={setAddSourceOpen}>
              <DialogContent size="md">
                <DialogHeader>
                  <DialogTitle>Add Data Source</DialogTitle>
                </DialogHeader>
                <DialogBody>
                  {availableToAdd.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-xs font-medium text-muted-foreground">From Registry</div>
                      <div className="space-y-1">
                        {availableToAdd.map((source) => {
                          const isThisAdding = isAdding && selectedSource === source.name;
                          return (
                            <button
                              key={source.name}
                              onClick={() => handleAddSource(source.name)}
                              disabled={isAdding}
                              className={cn(
                                "w-full flex items-start gap-3 p-3 rounded-lg border",
                                "hover:bg-accent hover:border-accent-foreground/20 transition-colors text-left",
                                isAdding && "opacity-50 cursor-not-allowed",
                              )}
                            >
                              <SourceIcon
                                icon={source.icon}
                                className="h-5 w-5 text-purple-400 shrink-0 mt-0.5"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="font-medium">{source.title}</div>
                                <div className="text-xs text-muted-foreground mt-0.5">
                                  {source.description}
                                </div>
                                {source.secrets.length > 0 && (
                                  <div className="flex items-center gap-1 mt-1.5 text-xs text-amber-500">
                                    <Key weight="fill" className="h-3 w-3" />
                                    Requires: {source.secrets.join(", ")}
                                  </div>
                                )}
                              </div>
                              {isThisAdding && (
                                <CircleNotch
                                  weight="bold"
                                  className="h-4 w-4 animate-spin shrink-0"
                                />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {availableToAdd.length === 0 && availableSources.length > 0 && (
                    <div className="text-center py-4 text-sm text-muted-foreground">
                      All available sources are already installed
                    </div>
                  )}

                  <div className="space-y-2 mt-4">
                    <div className="text-xs font-medium text-muted-foreground">Custom</div>
                    <button
                      onClick={() => setAddSourceOpen(false)}
                      className={cn(
                        "w-full flex items-start gap-3 p-3 rounded-lg border border-dashed",
                        "hover:bg-accent hover:border-accent-foreground/20 transition-colors text-left",
                      )}
                    >
                      <Code weight="duotone" className="h-5 w-5 text-blue-400 shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium">Blank Source</div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          Create a custom source from scratch
                        </div>
                      </div>
                    </button>
                  </div>
                </DialogBody>
              </DialogContent>
            </Dialog>

            {dataExpanded && (
              <div className="space-y-0">
                {isDbLoading ? (
                  <div className="space-y-1 py-1">
                    <div className="h-5 bg-muted/50 rounded animate-pulse" />
                    <div className="h-5 bg-muted/50 rounded animate-pulse w-3/4" />
                    <div className="h-5 bg-muted/50 rounded animate-pulse w-1/2" />
                  </div>
                ) : (
                  <>
                    {/* Unassociated Tables folder */}
                    {unassociatedTables.length > 0 && (
                      <div>
                        <button
                          onClick={() => setUnassociatedExpanded(!unassociatedExpanded)}
                          className={cn(listItemStyles, "group")}
                        >
                          {unassociatedExpanded ? (
                            <FolderOpen
                              weight="duotone"
                              className="h-4 w-4 shrink-0 text-purple-400"
                            />
                          ) : (
                            <Folder weight="duotone" className="h-4 w-4 shrink-0 text-purple-400" />
                          )}
                          <span className="flex-1 truncate text-left">Unassociated Tables</span>
                          <span className="text-xs text-muted-foreground/60">
                            {unassociatedTables.length}
                          </span>
                        </button>
                        {unassociatedExpanded && (
                          <div className="ml-4 border-l border-border/50 pl-2">
                            {(searchQuery
                              ? unassociatedTables.filter((t) =>
                                  t.toLowerCase().includes(searchQuery.toLowerCase()),
                                )
                              : unassociatedTables
                            ).map((tableName) => (
                              <div key={tableName} className={listItemStyles}>
                                <DataIcon />
                                <button
                                  onClick={() => handleTableClick(tableName)}
                                  className="flex-1 truncate text-left hover:underline"
                                >
                                  {tableName}
                                </button>
                                <ItemActions
                                  onDelete={() => handleDeleteTable(tableName)}
                                  deleteLabel="Drop table"
                                  onOpenChange={onMenuOpenChange}
                                />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Sources with their tables */}
                    {sources.length > 0 ? (
                      sources.map((source) => {
                        const isThisSyncing = isSyncing && syncingSourceId === source.id;
                        const hasMissingSecrets = source.missingSecrets.length > 0;
                        const isSourceExpanded = expandedSources.has(source.id);
                        const sourceTables = sourceTableMap.get(source.id) || [];
                        const filteredSourceTables = searchQuery
                          ? sourceTables.filter((t) =>
                              t.toLowerCase().includes(searchQuery.toLowerCase()),
                            )
                          : sourceTables;

                        return (
                          <div key={source.id}>
                            <div className={listItemStyles}>
                              <button onClick={() => toggleSource(source.id)} className="shrink-0">
                                {isSourceExpanded ? (
                                  <ChevronDown className="h-3 w-3" />
                                ) : (
                                  <ChevronRight className="h-3 w-3" />
                                )}
                              </button>
                              <SourceItemIcon />
                              <button
                                onClick={() => handleSourceClick(source.id)}
                                className="flex-1 truncate text-left hover:underline"
                              >
                                {source.title}
                              </button>
                              {sourceTables.length > 0 && (
                                <span className="text-xs text-muted-foreground/60">
                                  {sourceTables.length}
                                </span>
                              )}
                              {hasMissingSecrets && (
                                <Warning
                                  weight="fill"
                                  className="h-3.5 w-3.5 text-amber-500 shrink-0"
                                />
                              )}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  syncSource(source.id);
                                }}
                                disabled={isThisSyncing || hasMissingSecrets}
                                className={cn(
                                  "p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-accent transition-all",
                                  (isThisSyncing || hasMissingSecrets) &&
                                    "opacity-50 cursor-not-allowed",
                                )}
                                title={hasMissingSecrets ? "Configure secrets first" : "Sync now"}
                              >
                                {isThisSyncing ? (
                                  <CircleNotch weight="bold" className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <ArrowsClockwise weight="bold" className="h-3.5 w-3.5" />
                                )}
                              </button>
                              <ItemActions
                                onCopy={() => handleCopySource(source.id)}
                                onDelete={() => handleDeleteSource(source.id)}
                                onOpenChange={onMenuOpenChange}
                              />
                            </div>
                            {/* Source's tables */}
                            {(isSourceExpanded || searchQuery) &&
                              filteredSourceTables.length > 0 && (
                                <div className="ml-6 border-l border-border/50 pl-2">
                                  {filteredSourceTables.map((tableName) => (
                                    <div key={tableName} className={listItemStyles}>
                                      <DataIcon />
                                      <button
                                        onClick={() => handleTableClick(tableName)}
                                        className="flex-1 truncate text-left hover:underline"
                                      >
                                        {tableName}
                                      </button>
                                      <ItemActions
                                        onDelete={() => handleDeleteTable(tableName)}
                                        deleteLabel="Drop table"
                                        onOpenChange={onMenuOpenChange}
                                      />
                                    </div>
                                  ))}
                                </div>
                              )}
                          </div>
                        );
                      })
                    ) : unassociatedTables.length === 0 ? (
                      <div className={emptyStateStyles}>
                        <DataIcon empty />
                        <span>No data</span>
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
