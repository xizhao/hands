/**
 * ContentTabBar - Web-specific bottom tabs
 *
 * Clean data flow:
 * - Pages: SQLite _pages table -> pages.list
 * - Tables: SQLite user tables -> tables.list
 *
 * Layout: [+] [≡] | tabs... | [<] [>]
 */

import { CaretLeft, CaretRight, List, Plus } from "@phosphor-icons/react";
import { useParams, useNavigate } from "@tanstack/react-router";
import { FileText, Table2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  SyncStatusSlot,
  cn,
} from "@hands/app";
import { trpc } from "../../lib/trpc";

// Get page ID from path (e.g., "page-1.mdx" -> "page-1")
function getPageIdFromPath(path: string): string {
  return path.replace(/\.mdx$/, "");
}

export function ContentTabBar() {
  const navigate = useNavigate();

  // Get current page/table from router params
  const params = useParams({ strict: false });
  const currentPageId = (params as { pageId?: string }).pageId;
  const currentTableId = (params as { tableId?: string }).tableId;
  const workbookId = (params as { workbookId?: string }).workbookId;

  // Tab scroll state
  const tabsContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // Fetch pages - workbookId in query input scopes cache per workbook
  const { data: pagesData } = trpc.pages.list.useQuery(
    { workbookId },
    { enabled: !!workbookId }
  );
  const pages = pagesData?.pages ?? [];

  // Fetch tables - workbookId in query input scopes cache per workbook
  const { data: tablesData } = trpc.tables.list.useQuery(
    { workbookId },
    { enabled: !!workbookId }
  );
  const tables = tablesData?.tables ?? [];

  // tRPC utils for cache invalidation
  const utils = trpc.useUtils();

  // Create page mutation
  const createPage = trpc.pages.create.useMutation({
    onSuccess: (result) => {
      utils.pages.list.invalidate();
      if (workbookId) {
        navigate({
          to: "/w/$workbookId/pages/$pageId",
          params: { workbookId, pageId: result.pageId },
        });
      }
    },
  });

  // Create table mutation
  const createTable = trpc.tables.create.useMutation({
    onSuccess: (result) => {
      utils.tables.list.invalidate();
      if (workbookId) {
        navigate({
          to: "/w/$workbookId/tables/$tableId",
          params: { workbookId, tableId: result.tableId },
        });
      }
    },
  });

  // Rename mutations
  const renamePage = trpc.pages.rename.useMutation({
    onSuccess: (result) => {
      utils.pages.list.invalidate();
      if ("newRoute" in result && workbookId) {
        const newPageId = result.newRoute === "/" ? "index" : result.newRoute.slice(1);
        navigate({ to: "/w/$workbookId/pages/$pageId", params: { workbookId, pageId: newPageId } });
      }
    },
  });

  const renameTable = trpc.tables.rename.useMutation({
    onSuccess: (result) => {
      utils.tables.list.invalidate();
      if ("newName" in result && workbookId) {
        navigate({ to: "/w/$workbookId/tables/$tableId", params: { workbookId, tableId: result.newName } });
      }
    },
  });

  // Delete mutations - always navigate back to workbook root after delete
  const deletePage = trpc.pages.delete.useMutation({
    onSuccess: () => {
      utils.pages.list.invalidate();
      if (workbookId) {
        navigate({ to: "/w/$workbookId", params: { workbookId }, replace: true });
      }
    },
  });

  const deleteTable = trpc.tables.delete.useMutation({
    onSuccess: () => {
      utils.tables.list.invalidate();
      if (workbookId) {
        navigate({ to: "/w/$workbookId", params: { workbookId }, replace: true });
      }
    },
  });

  // Editing state
  const [editingTab, setEditingTab] = useState<{ type: "page" | "table"; id: string } | null>(null);
  const [editValue, setEditValue] = useState("");

  // Filter state for list dropdown
  const [filterText, setFilterText] = useState("");
  const filterInputRef = useRef<HTMLInputElement>(null);

  // Filtered lists based on filter text
  const filteredPages = filterText
    ? pages.filter((page) => {
        const title = page.title || getPageIdFromPath(page.path);
        return title.toLowerCase().includes(filterText.toLowerCase());
      })
    : pages;

  const filteredTables = filterText
    ? tables.filter((table) => {
        const displayName = table.name
          .split("_")
          .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" ");
        return (
          table.name.toLowerCase().includes(filterText.toLowerCase()) ||
          displayName.toLowerCase().includes(filterText.toLowerCase())
        );
      })
    : tables;

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
    const existingIds = pages.map((p) => getPageIdFromPath(p.path));
    let pageId = "page";
    if (existingIds.includes("page")) {
      let n = 1;
      while (existingIds.includes(`page-${n}`)) n++;
      pageId = `page-${n}`;
    }
    createPage.mutate({ pageId });
  };

  // Handle new table creation
  const handleNewTable = () => {
    const existingNames = tables.map((t) => t.name);
    let n = 1;
    while (existingNames.includes(`table_${n}`)) n++;
    const tableName = `table_${n}`;
    createTable.mutate({ name: tableName });
  };

  // Navigate to page
  const handlePageClick = (pageId: string) => {
    if (workbookId) {
      navigate({
        to: "/w/$workbookId/pages/$pageId",
        params: { workbookId, pageId },
      });
    }
  };

  // Navigate to table
  const handleTableClick = (tableId: string) => {
    if (workbookId) {
      navigate({
        to: "/w/$workbookId/tables/$tableId",
        params: { workbookId, tableId },
      });
    }
  };

  // Enter edit mode for a tab
  const handleEnterEditMode = (type: "page" | "table", id: string) => {
    setEditingTab({ type, id });
    setEditValue(id);
  };

  // Save the rename
  const handleSaveRename = () => {
    if (!editingTab) return;
    const trimmedValue = editValue.trim();
    if (!trimmedValue) {
      setEditingTab(null);
      return;
    }

    if (editingTab.type === "page") {
      const newSlug = trimmedValue.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
      if (newSlug && newSlug !== editingTab.id) {
        renamePage.mutate({ route: `/${editingTab.id}`, newSlug });
      }
    } else {
      const newName = trimmedValue.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
      if (newName && newName !== editingTab.id) {
        renameTable.mutate({ tableId: editingTab.id, newName });
      }
    }
    setEditingTab(null);
  };

  // Cancel editing
  const handleCancelEdit = () => {
    setEditingTab(null);
    setEditValue("");
  };

  // Handle keyboard in edit mode
  const handleEditKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSaveRename();
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleCancelEdit();
    }
  };

  // Delete handlers
  const handleDeletePage = (pageId: string) => {
    deletePage.mutate({ route: `/${pageId}` });
  };

  const handleDeleteTable = (tableId: string) => {
    deleteTable.mutate({ tableId });
  };

  // Get page title
  const getPageTitle = (page: { path: string; title?: string }) => {
    return page.title || getPageIdFromPath(page.path);
  };

  const hasOverflow = canScrollLeft || canScrollRight;

  return (
    <div className="h-full flex items-end bg-surface">
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
            <DropdownMenuItem onClick={handleNewTable} disabled={createTable.isPending}>
              <Table2 className="h-4 w-4 mr-2 text-emerald-500" />
              <span className="text-sm">New Table</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* List all button */}
        <DropdownMenu onOpenChange={(open) => {
          if (open) {
            // Focus the filter input after dropdown renders
            setTimeout(() => filterInputRef.current?.focus(), 0);
          } else {
            setFilterText("");
          }
        }}>
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
          <DropdownMenuContent align="start" className="w-[200px] flex flex-col relative">
            {/* Scrollable content area */}
            <div className={cn("max-h-[250px] overflow-y-auto", (pages.length > 0 || tables.length > 0) && "pb-9")}>
              {filteredPages.length > 0 && (
                <>
                  <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Pages</div>
                  {filteredPages.map((page) => {
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
              {filteredTables.length > 0 && (
                <>
                  {filteredPages.length > 0 && <DropdownMenuSeparator />}
                  <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Tables</div>
                  {filteredTables.map((table) => {
                    const isActive = currentTableId === table.id;
                    const displayName = table.name
                      .split("_")
                      .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
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
              {filteredPages.length === 0 && filteredTables.length === 0 && (
                <div className="px-2 py-3 text-sm text-muted-foreground text-center">
                  {filterText ? "No matches found" : "No pages or tables yet"}
                </div>
              )}
            </div>
            {/* Fixed filter input at bottom */}
            {(pages.length > 0 || tables.length > 0) && (
              <div className="absolute bottom-0 left-0 right-0 p-1.5 bg-popover border-t border-border">
                <input
                  ref={filterInputRef}
                  type="text"
                  placeholder="Filter..."
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                  className="w-full px-2 py-1 text-xs bg-muted border border-border rounded outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/60"
                />
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
            const isEditingThis = editingTab?.type === "page" && editingTab.id === pageId;

            return (
              <TabItem
                key={page.path}
                label={title}
                icon={FileText}
                isActive={isActive}
                iconColor="text-blue-500"
                onClick={() => handlePageClick(pageId)}
                isEditing={isEditingThis}
                editValue={isEditingThis ? editValue : undefined}
                onEditChange={setEditValue}
                onEditKeyDown={handleEditKeyDown}
                onEditBlur={handleSaveRename}
                onDoubleClick={isActive ? () => handleEnterEditMode("page", pageId) : undefined}
                onDelete={() => handleDeletePage(pageId)}
                showSyncStatus={true}
              />
            );
          })}

          {/* Table tabs */}
          {tables.map((table) => {
            const isActive = currentTableId === table.id;
            const displayName = table.name
              .split("_")
              .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
              .join(" ");
            const isEditingThis = editingTab?.type === "table" && editingTab.id === table.id;

            return (
              <TabItem
                key={table.id}
                label={displayName}
                icon={Table2}
                isActive={isActive}
                iconColor="text-emerald-500"
                onClick={() => handleTableClick(table.id)}
                isEditing={isEditingThis}
                editValue={isEditingThis ? editValue : undefined}
                onEditChange={setEditValue}
                onEditKeyDown={handleEditKeyDown}
                onEditBlur={handleSaveRename}
                onDoubleClick={isActive ? () => handleEnterEditMode("table", table.id) : undefined}
                onDelete={() => handleDeleteTable(table.id)}
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
      {(canScrollLeft || canScrollRight) && (
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
  isEditing?: boolean;
  editValue?: string;
  onEditChange?: (value: string) => void;
  onEditKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  onEditBlur?: () => void;
  onDoubleClick?: () => void;
  onDelete?: () => void;
  showSyncStatus?: boolean; // Show sync status slot for active page tabs
}

function TabItem({
  label,
  icon: Icon,
  isActive,
  iconColor,
  onClick,
  isEditing,
  editValue,
  onEditChange,
  onEditKeyDown,
  onEditBlur,
  onDoubleClick,
  onDelete,
  showSyncStatus,
}: TabItemProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onClick}
          onDoubleClick={onDoubleClick}
          className={cn(
            "group relative flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap",
            "rounded-b-md",
            isActive
              ? [
                  "bg-background text-foreground",
                  "border-x border-b border-border/40",
                  "-mt-px",
                ]
              : [
                  "text-muted-foreground hover:text-foreground",
                  "hover:bg-muted/50",
                  "border-x border-b border-transparent",
                ],
          )}
        >
          <Icon className={cn("h-3 w-3 shrink-0", isActive && iconColor)} />
          {isEditing ? (
            <input
              ref={inputRef}
              type="text"
              value={editValue}
              onChange={(e) => onEditChange?.(e.target.value)}
              onKeyDown={onEditKeyDown}
              onBlur={onEditBlur}
              onClick={(e) => e.stopPropagation()}
              className="w-20 px-1 py-0 text-xs bg-muted border border-border rounded outline-none focus:ring-1 focus:ring-ring"
            />
          ) : (
            <span className="truncate max-w-[100px]">{label}</span>
          )}
          {/* Sync status slot - PageEditor portals content here */}
          {showSyncStatus && isActive && <SyncStatusSlot />}
          {isActive && !isEditing && onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="ml-1 p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-muted transition-opacity"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </button>
      </TooltipTrigger>
      {!isEditing && <TooltipContent side="bottom">{label}</TooltipContent>}
    </Tooltip>
  );
}
