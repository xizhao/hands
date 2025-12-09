/**
 * NotebookShell - Linear-style layout with hover sidebar + titlebar
 *
 * Layout:
 * - Top: macOS-style titlebar with window controls, notebook switcher, breadcrumb, status
 * - Left: Hover-reveal sidebar for pages + data chips (only when on a page route)
 * - Main: Routed content (full sidebar or editor)
 * - Floating chat overlay
 */

import { useRef, useCallback, useState, useEffect, type ReactNode } from "react";
import { useRouter, useRouterState } from "@tanstack/react-router";
import { useUIStore } from "@/stores/ui";
import { useWorkbooks, useCreateWorkbook, useOpenWorkbook, useUpdateWorkbook, useDbSchema } from "@/hooks/useWorkbook";
import type { Workbook } from "@/lib/workbook";
import { cn } from "@/lib/utils";

import { PagesSidebar } from "./sidebar/PagesSidebar";
import { pageRoute } from "@/routes/_notebook/page.$pageId";
import { indexRoute } from "@/routes/_notebook/index";
import { ChatBar } from "@/components/ChatBar";
import { Thread } from "@/components/legacy/Thread";
import { LiveIndicator } from "./LiveIndicator";
import { RightPanel } from "./panels/RightPanel";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import {
  CaretDown,
  Plus,
  Check,
  Database,
  Gear,
  Link as LinkIcon,
  Copy,
  X,
} from "@phosphor-icons/react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

// Mock pages for breadcrumb lookup - will be replaced with real data
const MOCK_PAGES = [
  { id: "1", title: "Getting Started" },
  { id: "2", title: "Data Analysis" },
  { id: "3", title: "SQL Queries" },
];

interface NotebookShellProps {
  children: ReactNode;
}

export function NotebookShell({ children }: NotebookShellProps) {
  const router = useRouter();
  // Get pageId from current router state - use useRouterState for reactive updates
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;
  const pageMatch = currentPath.match(/^\/page\/(.+)$/);
  const pageId = pageMatch?.[1];
  const isOnPage = !!pageId;

  const { activeWorkbookId, rightPanel, toggleRightPanel } = useUIStore();
  const { data: workbooks } = useWorkbooks();
  const createWorkbook = useCreateWorkbook();
  const openWorkbook = useOpenWorkbook();
  const updateWorkbook = useUpdateWorkbook();
  const { setActiveWorkbook } = useUIStore();

  // Data for titlebar indicators
  const { data: dbSchema } = useDbSchema(activeWorkbookId);
  const tableCount = dbSchema?.length ?? 0;

  // Current workbook
  const currentWorkbook = workbooks?.find((w) => w.id === activeWorkbookId);

  // Current page (for breadcrumb)
  const currentPage = MOCK_PAGES.find((p) => p.id === pageId);

  // Sidebar hover state (invisible until hover on left edge) - only used when on a page
  const [sidebarVisible, setSidebarVisible] = useState(false);
  const sidebarTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleMouseEnterLeftEdge = useCallback(() => {
    if (sidebarTimeoutRef.current) clearTimeout(sidebarTimeoutRef.current);
    setSidebarVisible(true);
  }, []);

  const handleMouseLeaveSidebar = useCallback(() => {
    sidebarTimeoutRef.current = setTimeout(() => {
      setSidebarVisible(false);
    }, 300);
  }, []);

  // Sidebar resize state (for index view)
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartX = useRef(0);
  const resizeStartWidth = useRef(0);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    resizeStartX.current = e.clientX;
    resizeStartWidth.current = sidebarWidth;
  }, [sidebarWidth]);

  useEffect(() => {
    if (!isResizing) return;

    // Prevent text selection during resize
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - resizeStartX.current;
      const newWidth = Math.min(Math.max(resizeStartWidth.current + delta, 200), 500);
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [isResizing]);

  // Workbook title ref
  const titleInputRef = useRef<HTMLSpanElement>(null);

  // Handle workbook switch
  const handleSwitchWorkbook = useCallback((workbook: { id: string; directory: string; name: string }) => {
    setActiveWorkbook(workbook.id, workbook.directory);
    openWorkbook.mutate(workbook as Workbook);
  }, [setActiveWorkbook, openWorkbook]);

  // Handle create new workbook
  const handleCreateWorkbook = useCallback(() => {
    createWorkbook.mutate(
      { name: `Workbook ${(workbooks?.length ?? 0) + 1}` },
      {
        onSuccess: (newWorkbook) => {
          setActiveWorkbook(newWorkbook.id, newWorkbook.directory);
          openWorkbook.mutate(newWorkbook);
        },
      }
    );
  }, [createWorkbook, workbooks, setActiveWorkbook, openWorkbook]);

  // Handle close page (navigate back to index)
  const handleClosePage = useCallback(() => {
    router.navigate({ to: indexRoute.to });
  }, [router]);

  // Page count for indicator dots
  const pageCount = MOCK_PAGES.length;

  // Chat state
  const [chatExpanded, setChatExpanded] = useState(false);

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden relative">
      {/* Subtle 1px inset border on overall window - matches macOS ~10px corner radius */}
      <div className="absolute inset-0 pointer-events-none z-50 border border-white/[0.08] dark:border-white/[0.06]" style={{ borderRadius: '10px' }} />

      {/* macOS Titlebar - traffic lights at x:16 y:18 in tauri.conf.json */}
      <header
        data-tauri-drag-region
        className="h-11 flex items-center justify-between pl-[80px] pr-4 border-b border-border/50 bg-background shrink-0"
      >
        {/* Left: Workbook title + breadcrumb */}
        <div className="flex items-center gap-0 group/titlebar">
          {/* Editable workbook title */}
          <span
            ref={titleInputRef}
            contentEditable
            suppressContentEditableWarning
            onBlur={(e) => {
              const newName = e.currentTarget.textContent?.trim() || "";
              if (currentWorkbook && newName && newName !== currentWorkbook.name) {
                updateWorkbook.mutate({
                  ...currentWorkbook,
                  name: newName,
                  updated_at: Date.now(),
                });
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.currentTarget.blur();
              } else if (e.key === "Escape") {
                e.currentTarget.textContent = currentWorkbook?.name ?? "Untitled";
                e.currentTarget.blur();
              }
            }}
            className={cn(
              "px-1 py-0.5 text-sm font-medium bg-transparent rounded-sm cursor-text",
              "outline-none",
              "hover:bg-accent/50",
              "focus:bg-background focus:ring-1 focus:ring-ring/20"
            )}
            spellCheck={false}
          >
            {currentWorkbook?.name ?? "Untitled"}
          </span>

          {/* Live indicator (status dot) */}
          <LiveIndicator />

          {/* Workbook switcher - shows / by default, dropdown chevron on hover */}
          <div className="relative flex items-center justify-center w-5 h-5">
            {/* Slash separator - visible by default, hidden on hover */}
            <span className="text-muted-foreground/40 text-sm group-hover/titlebar:opacity-0 transition-opacity">/</span>
            {/* Dropdown trigger - hidden by default, visible on hover */}
            <DropdownMenu>
              <DropdownMenuTrigger className={cn(
                "absolute inset-0 flex items-center justify-center rounded-sm transition-all",
                "text-muted-foreground/50 hover:text-muted-foreground hover:bg-accent/50",
                "opacity-0 group-hover/titlebar:opacity-100 focus:opacity-100"
              )}>
                <CaretDown weight="bold" className="h-3 w-3" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-[200px]">
                {workbooks?.map((wb) => (
                  <DropdownMenuItem
                    key={wb.id}
                    onClick={() => handleSwitchWorkbook(wb)}
                    className="flex items-center justify-between"
                  >
                    <span className="truncate text-[13px]">{wb.name}</span>
                    {wb.id === activeWorkbookId && (
                      <Check weight="bold" className="h-3.5 w-3.5 text-primary shrink-0" />
                    )}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleCreateWorkbook}>
                  <Plus weight="bold" className="h-3.5 w-3.5 mr-2" />
                  <span className="text-[13px]">New Notebook</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Page name when on a page */}
          {isOnPage && currentPage && (
            <>
              <span className="text-sm text-muted-foreground">{currentPage.title}</span>
              <button
                onClick={handleClosePage}
                className="ml-1 p-0.5 rounded-sm text-muted-foreground/50 hover:text-muted-foreground hover:bg-accent/50 transition-colors opacity-0 group-hover/titlebar:opacity-100"
                title="Close page"
              >
                <X weight="bold" className="h-3 w-3" />
              </button>
            </>
          )}
        </div>

        {/* Right: Panel toggles + Share */}
        <div className="flex items-center gap-1">
          {/* Database - table browser */}
          <button
            onClick={() => toggleRightPanel("database")}
            className={cn(
              "flex items-center gap-1 px-1.5 py-1 rounded-md text-[11px] transition-colors",
              rightPanel === "database"
                ? "bg-accent text-foreground"
                : tableCount > 0
                  ? "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                  : "text-muted-foreground/50 hover:bg-accent/50 hover:text-muted-foreground"
            )}
            title="Database"
          >
            <Database weight="duotone" className={cn("h-3.5 w-3.5", tableCount > 0 && "text-blue-500")} />
            <span className={cn(
              "tabular-nums",
              tableCount > 0 ? "text-foreground" : "text-muted-foreground/50"
            )}>{tableCount}</span>
          </button>

          {/* Settings - gear icon only */}
          <button
            onClick={() => toggleRightPanel("settings")}
            className={cn(
              "flex items-center justify-center w-6 h-6 rounded-md transition-colors",
              rightPanel === "settings"
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            )}
            title="Settings"
          >
            <Gear weight="duotone" className="h-4 w-4" />
          </button>

          {/* Separator */}
          <div className="w-px h-4 bg-border mx-0.5" />

          {/* Share - text button with popover */}
          <Popover>
            <PopoverTrigger asChild>
              <button className="px-2 py-1 rounded-md text-[12px] font-medium text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors">
                Share
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 p-3">
              <div className="space-y-3">
                <div>
                  <div className="text-sm font-medium mb-1">Share workbook</div>
                  <p className="text-xs text-muted-foreground">
                    Anyone with the link can view this workbook.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex-1 px-2 py-1.5 text-xs font-mono bg-muted rounded-md truncate text-muted-foreground">
                    hands.app/w/{activeWorkbookId?.slice(0, 8)}
                  </div>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`https://hands.app/w/${activeWorkbookId}`);
                    }}
                    className="p-1.5 rounded-md hover:bg-accent transition-colors"
                    title="Copy link"
                  >
                    <Copy weight="duotone" className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </div>

                <div className="pt-2 border-t border-border">
                  <button className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded-md hover:bg-accent transition-colors">
                    <LinkIcon weight="duotone" className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>Copy link</span>
                  </button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </header>

      {/* Main layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar zone - always rendered, animates between states */}
        <div
          onMouseEnter={isOnPage ? handleMouseEnterLeftEdge : undefined}
          onMouseLeave={isOnPage ? handleMouseLeaveSidebar : undefined}
          className={cn(
            "shrink-0 flex flex-col transition-all duration-300 ease-out relative",
            isOnPage
              ? sidebarVisible ? "w-[180px]" : "w-6"
              : "w-full"
          )}
        >
          {/* Index view: centered sidebar */}
          <div
            className={cn(
              "absolute inset-0 flex items-start justify-center pt-8",
              "transition-all duration-300 ease-out",
              isOnPage
                ? "opacity-0 pointer-events-none scale-95"
                : "opacity-100 scale-100"
            )}
          >
            <div style={{ width: sidebarWidth }}>
              <PagesSidebar collapsed={false} fullWidth />
            </div>
            {/* Resize handle - invisible but interactive */}
            {!isOnPage && (
              <div
                onMouseDown={handleResizeStart}
                className={cn(
                  "absolute top-0 bottom-0 w-1 cursor-col-resize",
                  "hover:bg-border/50 active:bg-border transition-colors",
                  isResizing && "bg-border"
                )}
                style={{ left: `calc(50% + ${sidebarWidth / 2}px)` }}
              />
            )}
          </div>

          {/* Page view: collapsed sidebar with hover */}
          <div
            className={cn(
              "absolute inset-0",
              "transition-all duration-300 ease-out",
              isOnPage
                ? "opacity-100"
                : "opacity-0 pointer-events-none"
            )}
          >
            {/* Page indicator dots (when collapsed) */}
            <div
              className={cn(
                "flex flex-col items-center gap-0.5 pt-4 px-2",
                "transition-opacity duration-200",
                sidebarVisible ? "opacity-0" : "opacity-100"
              )}
            >
              {Array.from({ length: Math.min(pageCount, 5) }).map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    "w-1 h-1 rounded-full transition-colors",
                    MOCK_PAGES[i]?.id === pageId ? "bg-foreground/60" : "bg-foreground/15"
                  )}
                />
              ))}
              {pageCount > 5 && (
                <span className="text-[8px] text-muted-foreground/60 mt-0.5">+{pageCount - 5}</span>
              )}
            </div>

            {/* Pages list (when expanded via hover) */}
            <div
              className={cn(
                "absolute left-0 top-0 px-3 pt-4 h-full",
                "transition-all duration-200 ease-out",
                sidebarVisible
                  ? "opacity-100 translate-x-0"
                  : "opacity-0 -translate-x-2 pointer-events-none"
              )}
            >
              <PagesSidebar collapsed={false} />
            </div>
          </div>
        </div>

        {/* Main content area - routed content */}
        <main
          className={cn(
            "flex flex-col min-w-0 bg-background transition-all duration-300 ease-out",
            isOnPage ? "flex-1" : "w-0 overflow-hidden"
          )}
        >
          <div className="flex-1 relative">
            {isOnPage && (
              <div className="absolute inset-0 pointer-events-none border border-black/[0.06] rounded-sm" />
            )}
            {children}
          </div>
        </main>
      </div>

      {/* Right panel overlay */}
      <RightPanel />

      {/* Floating chat - bottom-up layout */}
      <div className="fixed bottom-4 left-4 right-4 z-50 max-w-2xl mx-auto flex flex-col">
        <Thread
          expanded={chatExpanded}
          onCollapse={() => setChatExpanded(false)}
          onExpand={() => setChatExpanded(true)}
        />
        <ChatBar
          expanded={chatExpanded}
          onExpandChange={setChatExpanded}
        />
      </div>
    </div>
  );
}
