/**
 * NotebookSidebar - Navigation sidebar for Data, Pages, and Actions
 *
 * Features:
 * - Data section containing:
 *   - Unassociated Tables folder (tables not linked to any source)
 *   - Sources (expandable to show their associated tables)
 * - Pages section
 * - Actions section
 * - Collapsible sections with headers
 * - Router-based navigation
 * - Unified responsive layout (single view, responsive styling)
 */

import {
  ArrowSquareOut,
  ArrowsClockwise,
  CaretLeft,
  CaretRight,
  CircleNotch,
  Clock,
  Code,
  Copy,
  Database,
  FileText,
  Folder,
  FolderOpen,
  Globe,
  Key,
  Newspaper,
  Play,
  Table,
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
import { useCallback, useMemo, useRef, useState } from "react";
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
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useRuntimePort, useRuntimeState } from "@/hooks/useRuntimeState";
import { useSourceManagement } from "@/hooks/useSources";
import { usePrefetchThumbnail, useThumbnail } from "@/hooks/useThumbnails";
import { useCreatePage } from "@/hooks/useWorkbook";
import { cn } from "@/lib/utils";
import { ThumbnailPreview } from "./ThumbnailPreview";
import { TablePreview } from "./TablePreview";
import { useTablePreview } from "@/hooks/useTablePreview";

// HoverCard wrapper - shows thumbnail preview on hover
function ThumbnailHoverCard({
  type,
  contentId,
  children,
  onMouseEnter,
}: {
  type: "page";
  contentId: string;
  children: React.ReactNode;
  onMouseEnter?: () => void;
}) {
  const { data: thumbnail } = useThumbnail(type, contentId);

  // No thumbnail - just render children without HoverCard
  if (!thumbnail?.thumbnail) {
    return <div onMouseEnter={onMouseEnter}>{children}</div>;
  }

  return (
    <HoverCard openDelay={150} closeDelay={100}>
      <HoverCardTrigger asChild>
        <div onMouseEnter={onMouseEnter}>{children}</div>
      </HoverCardTrigger>
      <HoverCardContent side="right" sideOffset={8} className="w-auto p-1">
        <ThumbnailPreview type={type} contentId={contentId} />
      </HoverCardContent>
    </HoverCard>
  );
}

// HoverCard wrapper - shows table schema preview on hover
function TablePreviewHoverCard({
  tableName,
  children,
}: {
  tableName: string;
  children: React.ReactNode;
}) {
  const { data: preview } = useTablePreview(tableName);

  // No preview data - just render children without HoverCard
  if (!preview || preview.columns.length === 0) {
    return <>{children}</>;
  }

  return (
    <HoverCard openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent side="right" sideOffset={8} className="w-auto p-2">
        <TablePreview tableName={tableName} />
      </HoverCardContent>
    </HoverCard>
  );
}

interface NotebookSidebarProps {
  collapsed?: boolean;
  fullWidth?: boolean;
  /** Whether sidebar is pinned open */
  pinned?: boolean;
  /** Callback to toggle pinned state */
  onPinnedChange?: (pinned: boolean) => void;
  /** Callback when a dropdown menu opens/closes */
  onMenuOpenChange?: (open: boolean) => void;
  /**
   * When true, selecting items will not navigate. Used in fullscreen/browse mode
   * where selection is handled differently (e.g., preview in main panel)
   */
  preventNavigation?: boolean;
  /** Callback when an item is selected (for preview mode) */
  onSelectItem?: (type: "page" | "source" | "table" | "action", id: string) => void;
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

function DataIcon({
  className,
  empty,
  colored = true,
}: {
  className?: string;
  empty?: boolean;
  colored?: boolean;
}) {
  return (
    <Table
      weight="duotone"
      className={cn(
        "h-4 w-4",
        listItemIconStyles,
        empty
          ? "opacity-50"
          : colored
            ? "text-purple-400"
            : "text-muted-foreground group-hover:text-foreground",
        className,
      )}
    />
  );
}

function ActionIcon({ className, empty }: { className?: string; empty?: boolean }) {
  return (
    <Play
      weight="fill"
      className={cn(
        "h-4 w-4",
        listItemIconStyles,
        empty ? "opacity-50" : "text-green-500",
        className,
      )}
    />
  );
}

function PageIcon({ className, empty }: { className?: string; empty?: boolean }) {
  return (
    <span
      className={cn(
        listItemIconStyles,
        empty ? "opacity-50" : "group-hover:text-orange-400",
        className,
      )}
    >
      &#x25AC;
    </span>
  );
}

// Action list item with run functionality
interface ActionListItemProps {
  action: {
    id: string;
    name: string;
    schedule?: string;
    triggers: string[];
  };
  onSelect: () => void;
  runtimePort: number | null;
}

function ActionListItem({ action, onSelect, runtimePort }: ActionListItemProps) {
  const [isRunning, setIsRunning] = useState(false);

  const handleRun = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!runtimePort || isRunning) return;

    setIsRunning(true);
    try {
      const res = await fetch(`http://localhost:${runtimePort}/trpc/actions.run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: action.id }),
      });
      if (!res.ok) {
        console.error("[sidebar] Failed to run action:", await res.text());
      } else {
        console.log("[sidebar] Action started:", action.id);
      }
    } catch (err) {
      console.error("[sidebar] Error running action:", err);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className={listItemStyles}>
      <ActionIcon />
      <button onClick={onSelect} className="flex-1 truncate text-left hover:underline">
        {action.name}
      </button>
      {/* Trigger indicators */}
      <div className="flex items-center gap-0.5">
        {action.schedule && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-muted-foreground/60">
                <Clock weight="duotone" className="h-3 w-3" />
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">Schedule: {action.schedule}</TooltipContent>
          </Tooltip>
        )}
        {action.triggers.includes("webhook") && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-muted-foreground/60">
                <Globe weight="duotone" className="h-3 w-3" />
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">Webhook trigger</TooltipContent>
          </Tooltip>
        )}
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={handleRun}
            disabled={isRunning || !runtimePort}
            className={cn(
              "p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-accent transition-all",
              (isRunning || !runtimePort) && "opacity-50 cursor-not-allowed",
            )}
          >
            {isRunning ? (
              <CircleNotch weight="bold" className="h-3.5 w-3.5 animate-spin text-green-500" />
            ) : (
              <Play weight="fill" className="h-3.5 w-3.5 text-green-500" />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">Run now</TooltipContent>
      </Tooltip>
    </div>
  );
}

// Reusable dropdown for item actions (copy, delete, convert to source)
interface ItemActionsProps {
  onCopy?: () => void;
  onDelete?: () => void;
  onConvertToSource?: () => void;
  copyLabel?: string;
  deleteLabel?: string;
  onOpenChange?: (open: boolean) => void;
}

function ItemActions({
  onCopy,
  onDelete,
  onConvertToSource,
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
      <DropdownMenuContent align="end" className="w-40">
        {onConvertToSource && (
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              onConvertToSource();
            }}
          >
            <ArrowSquareOut weight="duotone" className="h-3.5 w-3.5 mr-2" />
            Convert to Source
          </DropdownMenuItem>
        )}
        {onConvertToSource && (onCopy || onDelete) && <DropdownMenuSeparator />}
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
  preventNavigation = false,
  onSelectItem,
}: NotebookSidebarProps) {
  const navigate = useNavigate();
  const router = useRouter();

  // Consolidated runtime state - single source of truth
  const {
    workbookId: activeWorkbookId,
    manifest,
    isStarting,
    isDbBooting,
  } = useRuntimeState();

  // Tables from manifest (discovered from db.sqlite)
  const tables = manifest?.tables ?? [];

  // Derived loading states
  const manifestLoading = !manifest && !!activeWorkbookId;
  const isDbLoading = isStarting || isDbBooting;

  // Source management hooks
  const { sources, availableSources, addSource, isAdding, syncSource, isSyncing, syncingSourceId } =
    useSourceManagement();

  // All data from manifest (filesystem source of truth)
  const actions = manifest?.actions ?? [];
  const pages = manifest?.pages ?? [];

  const [pagesExpanded, setPagesExpanded] = useState(true);
  const [dataExpanded, setDataExpanded] = useState(true);
  const [actionsExpanded, setActionsExpanded] = useState(true);
  const [expandedSources, setExpandedSources] = useState<Set<string>>(new Set()); // Track expanded sources
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set()); // Track expanded page folders

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

  // Toggle folder expansion
  const toggleFolder = useCallback((folderId: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  }, []);

  // Group pages by folder
  const { rootPages, pageFolders } = useMemo(() => {
    const root: typeof pages = [];
    const folders = new Map<string, typeof pages>();

    for (const page of pages) {
      if (!page.parentDir) {
        root.push(page);
      } else {
        if (!folders.has(page.parentDir)) {
          folders.set(page.parentDir, []);
        }
        folders.get(page.parentDir)!.push(page);
      }
    }

    return { rootPages: root, pageFolders: folders };
  }, [pages]);

  // Group tables by source - tables prefixed with source name belong to that source
  const { sourceTableMap, unassociatedTables } = useMemo(() => {
    const tableMap = new Map<string, string[]>(); // sourceId -> table names
    const unassociated: string[] = [];

    if (tables.length === 0) return { sourceTableMap: tableMap, unassociatedTables: unassociated };

    for (const table of tables) {
      const tableName = table.name;
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
  }, [tables, sources]);
  const [searchQuery, setSearchQuery] = useState("");
  const [addSourceOpen, setAddSourceOpen] = useState(false);
  const [isCreatingNewPage, setIsCreatingNewPage] = useState(false);
  const [newPageName, setNewPageName] = useState("");
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const isConfirmingPageRef = useRef(false); // Guard against double submission for pages
  const newPageInputRef = useCallback((node: HTMLInputElement | null) => {
    if (node) node.focus();
  }, []);

  // Create page mutation
  const { mutateAsync: createPage, isPending: isCreatingPage } = useCreatePage();

  // Page creation handlers
  const handleStartNewPage = () => {
    setIsCreatingNewPage(true);
    setNewPageName("");
  };

  const handleCancelNewPage = () => {
    setIsCreatingNewPage(false);
    setNewPageName("");
  };

  const handleConfirmNewPage = async () => {
    // Guard against double submission
    if (isConfirmingPageRef.current) return;

    if (!newPageName.trim()) {
      handleCancelNewPage();
      return;
    }

    // Sanitize the name to create a valid page ID
    const pageId = newPageName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    if (!pageId) {
      handleCancelNewPage();
      return;
    }

    // Set guard before async work
    isConfirmingPageRef.current = true;

    // Check if page already exists
    const existingPage = pages.find((p) => p.id === pageId);
    if (existingPage) {
      // Just navigate to existing page
      setIsCreatingNewPage(false);
      setNewPageName("");
      isConfirmingPageRef.current = false;
      navigate({ to: "/pages/$pageId", params: { pageId } });
      return;
    }

    try {
      await createPage({ pageId });
      setIsCreatingNewPage(false);
      setNewPageName("");
      // Navigate to the newly created page
      navigate({ to: "/pages/$pageId", params: { pageId } });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to create page";
      // If page already exists, just navigate to it
      if (message.includes("already exists")) {
        setIsCreatingNewPage(false);
        setNewPageName("");
        navigate({ to: "/pages/$pageId", params: { pageId } });
      } else {
        console.error("[sidebar] failed to create page:", err);
      }
    } finally {
      isConfirmingPageRef.current = false;
    }
  };

  const handleNewPageKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleConfirmNewPage();
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleCancelNewPage();
    }
  };

  // Get installed source names for filtering
  const installedSourceNames = sources.map((s) => s.name);
  const availableToAdd = availableSources.filter((s) => !installedSourceNames.includes(s.name));

  const handleAddSource = async (sourceName: string) => {
    setSelectedSource(sourceName);
    await addSource(sourceName);
    setSelectedSource(null);
    setAddSourceOpen(false);
  };

  // Filter tables based on search query
  const _filteredTables = useMemo(() => {
    if (!searchQuery.trim() || tables.length === 0) return tables;
    const query = searchQuery.toLowerCase();
    return tables.filter((table) => table.name.toLowerCase().includes(query));
  }, [tables, searchQuery]);

  // Handle page click - navigate to page editor or call callback
  const handlePageClick = useCallback(
    (pageId: string) => {
      if (preventNavigation) {
        onSelectItem?.("page", pageId);
        return;
      }
      console.log("[sidebar] navigating to page:", pageId);
      navigate({ to: "/pages/$pageId", params: { pageId } });
    },
    [navigate, preventNavigation, onSelectItem],
  );

  // Handle source click - navigate to sources list or call callback
  const handleSourceClick = useCallback(
    (sourceId: string) => {
      if (preventNavigation) {
        onSelectItem?.("source", sourceId);
        return;
      }
      console.log("[sidebar] navigating to sources");
      navigate({ to: "/sources" });
    },
    [navigate, preventNavigation, onSelectItem],
  );

  // Handle table click - navigate to table viewer or call callback
  const handleTableClick = useCallback(
    (tableId: string) => {
      if (preventNavigation) {
        onSelectItem?.("table", tableId);
        return;
      }
      console.log("[sidebar] navigating to table:", tableId);
      navigate({ to: "/tables/$tableId", params: { tableId } });
    },
    [navigate, preventNavigation, onSelectItem],
  );

  // Runtime port for API calls
  const runtimePort = useRuntimePort();

  // Prefetch thumbnails on hover for faster previews
  const prefetchThumbnail = usePrefetchThumbnail();

  // CRUD action handlers
  const handleDuplicatePage = useCallback(
    async (pageId: string) => {
      if (!runtimePort) return;
      try {
        const res = await fetch(
          `http://localhost:${runtimePort}/workbook/pages/${pageId}/duplicate`,
          {
            method: "POST",
          },
        );
        if (!res.ok) throw new Error("Failed to duplicate page");
        const data = await res.json();
        console.log("[sidebar] duplicated page:", pageId, "->", data.newRoute);
      } catch (err) {
        console.error("[sidebar] failed to duplicate page:", err);
      }
    },
    [runtimePort],
  );

  const handleDeletePage = useCallback(
    async (pageId: string) => {
      if (!runtimePort) return;
      try {
        const res = await fetch(`http://localhost:${runtimePort}/workbook/pages/${pageId}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error("Failed to delete page");
        console.log("[sidebar] deleted page:", pageId);
        // Navigate away if we deleted the current page
        navigate({ to: "/" });
      } catch (err) {
        console.error("[sidebar] failed to delete page:", err);
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

  const handleConvertToSource = useCallback(
    async (tableName: string) => {
      if (!runtimePort) return;
      try {
        const res = await fetch(
          `http://localhost:${runtimePort}/workbook/sources/from-table/${tableName}`,
          {
            method: "POST",
          },
        );
        if (!res.ok) throw new Error("Failed to convert table to source");
        const data = await res.json();
        console.log("[sidebar] converted table to source:", tableName, data);
        // Navigate to the sources list
        navigate({ to: "/sources" });
      } catch (err) {
        console.error("[sidebar] failed to convert table to source:", err);
      }
    },
    [runtimePort, navigate],
  );

  if (collapsed) {
    return (
      <TooltipProvider delayDuration={0}>
        <div className="space-y-3 px-1">
          {/* Pages section - collapsed: show all as compact icons */}
          {pages.length > 0 ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex flex-wrap gap-0.5 justify-center pt-2 border-t border-border/50 cursor-default">
                  {pages.map((page) => (
                    <span key={page.id} className="text-[8px] leading-none text-muted-foreground/70">
                      &#x25AC;
                    </span>
                  ))}
                </div>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>
                  {pages.length} page{pages.length !== 1 ? "s" : ""}
                </p>
              </TooltipContent>
            </Tooltip>
          ) : (
            <div className="pt-2 border-t border-border/50">
              <div className="flex justify-center">
                <span className="text-[8px] leading-none text-muted-foreground/30">&#x25AC;</span>
              </div>
            </div>
          )}

          {/* Data section - collapsed: show all tables as compact icons */}
          {tables.length > 0 ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex flex-wrap gap-0.5 justify-center pt-2 border-t border-border/50 cursor-default">
                  {tables.map((table) => (
                    <span
                      key={table.name}
                      className="text-[8px] leading-none text-emerald-400/70"
                    >
                      &#x25A0;
                    </span>
                  ))}
                </div>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>
                  {tables.length} table{tables.length !== 1 ? "s" : ""}
                </p>
              </TooltipContent>
            </Tooltip>
          ) : (
            <div className="pt-2 border-t border-border/50">
              <div className="flex justify-center">
                <span className="text-[8px] leading-none text-muted-foreground/30">&#x25A0;</span>
              </div>
            </div>
          )}

          {/* Actions section - collapsed: show all as compact icons */}
          {actions.length > 0 ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex flex-wrap gap-0.5 justify-center pt-2 border-t border-border/50 cursor-default">
                  {actions.map((action) => (
                    <span key={action.id} className="text-[8px] leading-none text-green-500/70">
                      &#x25B6;
                    </span>
                  ))}
                </div>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>
                  {actions.length} action{actions.length !== 1 ? "s" : ""}
                </p>
              </TooltipContent>
            </Tooltip>
          ) : (
            <div className="pt-2 border-t border-border/50">
              <div className="flex justify-center">
                <span className="text-[8px] leading-none text-muted-foreground/30">&#x25B6;</span>
              </div>
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
            placeholder="Search pages, sources..."
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
          {/* Pages Section - first in sidebar */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
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
                    onClick={handleStartNewPage}
                    className="p-0.5 text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                    title="New page"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">New page</TooltipContent>
              </Tooltip>
            </div>

            {pagesExpanded && (
              <div className="space-y-0">
                {/* Inline new page input */}
                {isCreatingNewPage && (
                  <div className={cn(listItemStyles, "pr-1")}>
                    <PageIcon />
                    <input
                      ref={newPageInputRef}
                      type="text"
                      value={newPageName}
                      onChange={(e) => setNewPageName(e.target.value)}
                      onKeyDown={handleNewPageKeyDown}
                      onBlur={handleConfirmNewPage}
                      placeholder="page-name"
                      disabled={isCreatingPage}
                      className="flex-1 bg-transparent border-none outline-none text-sm placeholder:text-muted-foreground/50"
                    />
                    {isCreatingPage && (
                      <CircleNotch
                        weight="bold"
                        className="h-3 w-3 animate-spin text-muted-foreground"
                      />
                    )}
                  </div>
                )}
                {manifestLoading ? (
                  <div className={emptyStateStyles}>Loading...</div>
                ) : pages.length > 0 || isCreatingNewPage ? (
                  <>
                    {/* Root pages (no parentDir) */}
                    {(searchQuery
                      ? rootPages.filter((p) =>
                          p.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          p.id.toLowerCase().includes(searchQuery.toLowerCase()),
                        )
                      : rootPages
                    ).map((page) => (
                      <ThumbnailHoverCard
                        key={page.id}
                        type="page"
                        contentId={page.id}
                        onMouseEnter={() => prefetchThumbnail("page", page.id)}
                      >
                        <div className={cn(listItemStyles, "group")}>
                          <PageIcon />
                          <button
                            onClick={() => handlePageClick(page.id)}
                            className="flex-1 truncate text-left hover:underline"
                          >
                            {page.title}
                          </button>
                          <ItemActions
                            onCopy={() => handleDuplicatePage(page.id)}
                            onDelete={() => handleDeletePage(page.id)}
                            onOpenChange={onMenuOpenChange}
                          />
                        </div>
                      </ThumbnailHoverCard>
                    ))}

                    {/* Page folders */}
                    {Array.from(pageFolders.entries()).map(([folderName, folderPages]) => {
                      const isFolderExpanded = expandedFolders.has(folderName);
                      const filteredFolderPages = searchQuery
                        ? folderPages.filter((p) =>
                            p.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            p.id.toLowerCase().includes(searchQuery.toLowerCase()),
                          )
                        : folderPages;

                      // Skip folder if search active and no matching pages
                      if (searchQuery && filteredFolderPages.length === 0) return null;

                      return (
                        <div key={folderName}>
                          <div className={cn(listItemStyles, "group")}>
                            <button
                              onClick={() => toggleFolder(folderName)}
                              className="shrink-0"
                            >
                              {isFolderExpanded ? (
                                <ChevronDown className="h-3 w-3" />
                              ) : (
                                <ChevronRight className="h-3 w-3" />
                              )}
                            </button>
                            {isFolderExpanded ? (
                              <FolderOpen weight="duotone" className="h-4 w-4 text-orange-400/70" />
                            ) : (
                              <Folder weight="duotone" className="h-4 w-4 text-orange-400/70" />
                            )}
                            <button
                              onClick={() => toggleFolder(folderName)}
                              className="flex-1 truncate text-left hover:underline"
                            >
                              {folderName}
                            </button>
                            <span className="text-xs text-muted-foreground/60">
                              {folderPages.length}
                            </span>
                          </div>

                          {/* Folder contents */}
                          {(isFolderExpanded || searchQuery) && filteredFolderPages.length > 0 && (
                            <div className="ml-4 border-l border-border/50 pl-1">
                              {filteredFolderPages.map((page) => (
                                <ThumbnailHoverCard
                                  key={page.id}
                                  type="page"
                                  contentId={page.id}
                                  onMouseEnter={() => prefetchThumbnail("page", page.id)}
                                >
                                  <div className={cn(listItemStyles, "group")}>
                                    <PageIcon />
                                    <button
                                      onClick={() => handlePageClick(page.id)}
                                      className="flex-1 truncate text-left hover:underline"
                                    >
                                      {page.title}
                                    </button>
                                    <ItemActions
                                      onCopy={() => handleDuplicatePage(page.id)}
                                      onDelete={() => handleDeletePage(page.id)}
                                      onOpenChange={onMenuOpenChange}
                                    />
                                  </div>
                                </ThumbnailHoverCard>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </>
                ) : (
                  <div className={emptyStateStyles}>
                    <PageIcon empty />
                    <span>No pages</span>
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

            {dataExpanded && !isDbLoading && (
              <div className="space-y-0">
                <>
                    {/* Sources with their tables */}
                    {sources.length > 0
                      ? sources.map((source) => {
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
                                <button
                                  onClick={() => toggleSource(source.id)}
                                  className="shrink-0"
                                >
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
                                    <CircleNotch
                                      weight="bold"
                                      className="h-3.5 w-3.5 animate-spin"
                                    />
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
                                      <TablePreviewHoverCard key={tableName} tableName={tableName}>
                                        <div className={listItemStyles}>
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
                                      </TablePreviewHoverCard>
                                    ))}
                                  </div>
                                )}
                            </div>
                          );
                        })
                      : null}

                    {/* Unassigned tables (flat list, no folder) */}
                    {(searchQuery
                      ? unassociatedTables.filter((t) =>
                          t.toLowerCase().includes(searchQuery.toLowerCase()),
                        )
                      : unassociatedTables
                    ).map((tableName) => (
                      <TablePreviewHoverCard key={tableName} tableName={tableName}>
                        <div className={listItemStyles}>
                          <DataIcon colored={false} />
                          <button
                            onClick={() => handleTableClick(tableName)}
                            className="flex-1 truncate text-left hover:underline"
                          >
                            {tableName}
                          </button>
                          <ItemActions
                            onConvertToSource={() => handleConvertToSource(tableName)}
                            onDelete={() => handleDeleteTable(tableName)}
                            deleteLabel="Drop table"
                            onOpenChange={onMenuOpenChange}
                          />
                        </div>
                      </TablePreviewHoverCard>
                    ))}

                    {/* Empty state */}
                    {sources.length === 0 && unassociatedTables.length === 0 && (
                      <div className={emptyStateStyles}>
                        <DataIcon empty />
                        <span>No data</span>
                      </div>
                    )}
                </>
              </div>
            )}
          </div>

          {/* Actions Section */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setActionsExpanded(!actionsExpanded)}
                className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground/80 uppercase tracking-wider hover:text-muted-foreground transition-colors"
              >
                {actionsExpanded ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
                Actions
              </button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className="p-0.5 text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                    title="New action"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">New action</TooltipContent>
              </Tooltip>
            </div>

            {actionsExpanded &&
              ((manifest?.actions ?? []).length > 0 ? (
                <div className="space-y-0">
                  {(manifest?.actions ?? []).map((action) => (
                    <ActionListItem
                      key={action.id}
                      action={action}
                      onSelect={() => {
                        if (preventNavigation) {
                          onSelectItem?.("action", action.id);
                          return;
                        }
                        navigate({ to: "/actions/$actionId", params: { actionId: action.id } });
                      }}
                      runtimePort={runtimePort}
                    />
                  ))}
                </div>
              ) : (
                <div className={emptyStateStyles}>
                  <ActionIcon empty />
                  <span>No actions</span>
                </div>
              ))}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
