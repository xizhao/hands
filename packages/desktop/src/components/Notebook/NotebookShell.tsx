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
import {
  useWorkbooks,
  useCreateWorkbook,
  useOpenWorkbook,
  useUpdateWorkbook,
  useDbSchema,
  useDevServerRoutes,
  useDevServerStatus,
  useEvalResult,
  useRuntimeStatus,
  useRuntimeHealth,
  useWorkbookManifest,
  useCreatePage,
  useUpdatePageTitle,
} from "@/hooks/useWorkbook";
import type { Workbook } from "@/lib/workbook";
import { cn } from "@/lib/utils";

import { PagesSidebar } from "./sidebar/PagesSidebar";
import { EmptyWorkbookState } from "./EmptyWorkbookState";
import { pageRoute } from "@/routes/_notebook/page.$pageId";
import { indexRoute } from "@/routes/_notebook/index";
import { ChatBar } from "@/components/ChatBar";
import { Thread } from "@/components/Notebook/Thread";
import { FileDropOverlay } from "@/components/FileDropOverlay";
import { RightPanel } from "./panels/RightPanel";
import { NewWorkbookModal } from "@/components/NewWorkbookModal";

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
  Warning,
} from "@phosphor-icons/react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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

  const { activeWorkbookId, rightPanel, toggleRightPanel, setActiveWorkbook, setActiveSession } = useUIStore();
  const { data: workbooks } = useWorkbooks();
  const createWorkbook = useCreateWorkbook();
  const openWorkbook = useOpenWorkbook();
  const updateWorkbook = useUpdateWorkbook();

  // Data for titlebar indicators and empty state detection
  const { data: dbSchema } = useDbSchema(activeWorkbookId);
  const { data: devServerRoutes } = useDevServerRoutes(activeWorkbookId);
  const { data: devServerStatus, isLoading: isLoadingStatus } = useDevServerStatus(activeWorkbookId);
  const { data: evalResult } = useEvalResult(activeWorkbookId);
  const { data: runtimeStatus } = useRuntimeStatus(activeWorkbookId);
  const { data: manifest } = useWorkbookManifest(activeWorkbookId);
  // Use Tauri-reported port - don't fallback to default since runtime may be on different port
  const runtimePort = runtimeStatus?.runtime_port ?? 0;

  // Progressive readiness - shows manifest instantly, tracks DB/Vite boot status
  const { data: runtimeHealth } = useRuntimeHealth(runtimePort > 0 ? runtimePort : null);
  const isRuntimeBooting = runtimeHealth?.status === "booting";
  const isRuntimeReady = runtimeHealth?.status === "ready";

  // Runtime connection status
  const runtimeConnected = devServerStatus?.running ?? false;
  const dbConnected = runtimeConnected && !!devServerStatus?.postgres_port;

  // Mutations for empty state actions
  const createPage = useCreatePage();
  const updatePageTitle = useUpdatePageTitle();

  const tableCount = dbSchema?.length ?? 0;
  const blockCount = devServerRoutes?.charts?.length ?? 0;
  const pageCount = manifest?.pages?.length ?? 0;

  // Compute alert counts from eval result
  const alertErrors = (evalResult?.typescript?.errors?.length ?? 0) + (evalResult?.format?.errors?.length ?? 0);
  const alertWarnings = evalResult?.typescript?.warnings?.length ?? 0;
  const alertCount = alertErrors + alertWarnings;

  // Show getting started when no data - use manifest.tables (from SSE) which loads faster
  // Fall back to dbSchema for titlebar button count (more detailed schema info)
  const manifestTableCount = manifest?.tables?.length ?? 0;
  const showGettingStarted = manifestTableCount === 0 && tableCount === 0;

  // Current workbook
  const currentWorkbook = workbooks?.find((w) => w.id === activeWorkbookId);

  // Current page (for breadcrumb) - from manifest (filesystem source of truth)
  const currentPage = manifest?.pages?.find((p) => p.id === pageId);

  // Sidebar hover state (invisible until hover on left edge) - only used when on a page
  const [sidebarVisible, setSidebarVisible] = useState(false);
  const sidebarTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Sidebar width state (for resizing when expanded)
  const [sidebarWidth, setSidebarWidth] = useState(200);
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartX = useRef(0);
  const resizeStartWidth = useRef(0);

  const handleMouseEnterLeftEdge = useCallback(() => {
    if (sidebarTimeoutRef.current) clearTimeout(sidebarTimeoutRef.current);
    setSidebarVisible(true);
  }, []);

  const handleMouseLeaveSidebar = useCallback(() => {
    // Don't hide while resizing
    if (isResizing) return;
    sidebarTimeoutRef.current = setTimeout(() => {
      setSidebarVisible(false);
    }, 300);
  }, [isResizing]);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    resizeStartX.current = e.clientX;
    resizeStartWidth.current = sidebarWidth;
  }, [sidebarWidth]);

  useEffect(() => {
    if (!isResizing) return;

    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - resizeStartX.current;
      const newWidth = Math.min(Math.max(resizeStartWidth.current + delta, 160), 400);
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

  // Handle create new workbook - opens modal
  const handleCreateWorkbook = useCallback(() => {
    setShowNewWorkbookModal(true);
  }, []);

  // Handle actual workbook creation from modal
  const handleWorkbookCreate = useCallback(
    (name: string, description?: string, templateId?: string) => {
      createWorkbook.mutate(
        { name, description },
        {
          onSuccess: (newWorkbook) => {
            setActiveWorkbook(newWorkbook.id, newWorkbook.directory);
            openWorkbook.mutate(newWorkbook);
            setShowNewWorkbookModal(false);
            // TODO: Apply template if templateId is provided
            if (templateId) {
              console.log(`Applying template: ${templateId}`);
            }
          },
        }
      );
    },
    [createWorkbook, setActiveWorkbook, openWorkbook]
  );

  // Handle close page (navigate back to index)
  const handleClosePage = useCallback(() => {
    router.navigate({ to: indexRoute.to });
  }, [router]);

  // Hidden file input ref for import
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Empty state handlers
  const handleAddSource = useCallback(() => {
    // Open database panel where user can add sources
    toggleRightPanel("database");
  }, [toggleRightPanel]);

  // Get setPendingAttachment and setAutoSubmitPending early so callbacks can use it
  const { setPendingAttachment, setAutoSubmitPending } = useUIStore();

  const handleImportFile = useCallback(() => {
    // Trigger file input click
    fileInputRef.current?.click();
  }, []);

  const handleFileSelected = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Set as pending attachment
    setPendingAttachment({ type: "file", file, name: file.name });
    // Expand chat to show the attachment
    setChatExpanded(true);

    // Reset input so same file can be selected again
    e.target.value = "";
  }, [setPendingAttachment]);

  const handleAddPage = useCallback(async () => {
    console.log("[handleAddPage] Creating page on port:", runtimePort);
    try {
      const result = await createPage.mutateAsync({ runtimePort, title: "Untitled" });
      console.log("[handleAddPage] Create result:", result);
      if (result.success && result.page) {
        // Navigate to the new page
        console.log("[handleAddPage] Navigating to page:", result.page.id);
        router.navigate({ to: pageRoute.to, params: { pageId: result.page.id } });
      }
    } catch (err) {
      console.error("[handleAddPage] Failed to create page:", err);
      // TODO: Show toast notification on failure
    }
  }, [runtimePort, createPage, router]);

  // Chat state
  const [chatExpanded, setChatExpanded] = useState(false);

  // New workbook modal state
  const [showNewWorkbookModal, setShowNewWorkbookModal] = useState(false);

  // File drop handler for external files - set as pending attachment and auto-submit
  const handleFileDrop = useCallback((file: File) => {
    console.log("[handleFileDrop] File dropped, setting as attachment and auto-submitting:", file.name);
    setPendingAttachment({ type: "file", file, name: file.name });
    // Expand chat and trigger auto-submit
    setChatExpanded(true);
    setAutoSubmitPending(true);
  }, [setPendingAttachment, setAutoSubmitPending]);

  return (
    <TooltipProvider delayDuration={300}>
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


          {/* Workbook switcher dropdown - always visible */}
          <div className="relative flex items-center justify-center w-5 h-5">
            {/* Slash separator - only visible when on a page, hidden on hover */}
            {isOnPage && (
              <span className="text-muted-foreground/60 text-sm group-hover/titlebar:opacity-0 transition-opacity">/</span>
            )}
            {/* Dropdown trigger - hidden by default (shows on hover), or always visible when not on page */}
            <DropdownMenu>
              <DropdownMenuTrigger className={cn(
                "absolute inset-0 flex items-center justify-center rounded-sm transition-all",
                "text-muted-foreground/70 hover:text-muted-foreground hover:bg-accent/50",
                isOnPage
                  ? "opacity-0 group-hover/titlebar:opacity-100 focus:opacity-100"
                  : "opacity-100"
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

          {/* Page breadcrumb - only show when on a page route */}
          {isOnPage && currentPage && (
            <>
              <span
                contentEditable
                suppressContentEditableWarning
                onBlur={(e) => {
                  const newTitle = e.currentTarget.textContent?.trim() || "";
                  if (pageId && newTitle && newTitle !== currentPage.title) {
                    updatePageTitle.mutate({ pageId, title: newTitle });
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    e.currentTarget.blur();
                  } else if (e.key === "Escape") {
                    e.currentTarget.textContent = currentPage.title;
                    e.currentTarget.blur();
                  }
                }}
                className={cn(
                  "px-1 py-0.5 text-sm text-muted-foreground bg-transparent rounded-sm cursor-text",
                  "outline-none",
                  "hover:bg-accent/50 hover:text-foreground",
                  "focus:bg-background focus:text-foreground focus:ring-1 focus:ring-ring/20"
                )}
                spellCheck={false}
              >
                {currentPage.title}
              </span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleClosePage}
                    className="ml-1 p-0.5 rounded-sm text-muted-foreground/70 hover:text-muted-foreground hover:bg-accent/50 transition-colors opacity-0 group-hover/titlebar:opacity-100"
                  >
                    <X weight="bold" className="h-3 w-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Close page</TooltipContent>
              </Tooltip>
            </>
          )}
        </div>

        {/* Right: Panel toggles + Share */}
        <div className="flex items-center gap-1">
          {/* Loading shimmer when connecting to runtime */}
          {isLoadingStatus && activeWorkbookId && (
            <div className="flex items-center gap-1 px-2 py-1">
              <div className="h-4 w-8 bg-muted/50 rounded animate-pulse" />
              <div className="h-4 w-8 bg-muted/50 rounded animate-pulse" />
            </div>
          )}

          {/* Booting indicator - shows when runtime is starting */}
          {isRuntimeBooting && !isLoadingStatus && (
            <div className="px-2 py-1" title="Starting...">
              <div className="h-1.5 w-1.5 rounded-full bg-yellow-500 animate-pulse" />
            </div>
          )}

          {/* Database - table browser */}
          {!isLoadingStatus && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => toggleRightPanel("database")}
                  className={cn(
                    "flex items-center gap-1 px-1.5 py-1 rounded-md text-[11px] transition-colors",
                    rightPanel === "database"
                      ? "bg-accent text-foreground"
                      : dbConnected && tableCount > 0
                        ? "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                        : "text-muted-foreground/70 hover:bg-accent/50 hover:text-muted-foreground"
                  )}
                >
                  <Database weight="duotone" className={cn("h-3.5 w-3.5", dbConnected && tableCount > 0 && "text-blue-500")} />
                  <span className={cn(
                    "tabular-nums",
                    dbConnected && tableCount > 0 ? "text-foreground" : "text-muted-foreground/70"
                  )}>{tableCount}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {dbConnected ? "Database" : "Database (not connected)"}
              </TooltipContent>
            </Tooltip>
          )}

          {/* Runtime/Alerts */}
          {!isLoadingStatus && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => toggleRightPanel("alerts")}
                  className={cn(
                    "flex items-center gap-1 px-1.5 py-1 rounded-md text-[11px] transition-colors",
                    rightPanel === "alerts"
                      ? "bg-accent text-foreground"
                      : !runtimeConnected
                        ? "text-muted-foreground/70 hover:bg-accent/50 hover:text-muted-foreground"
                        : alertCount > 0
                          ? "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                  )}
                >
                  <Warning weight="duotone" className={cn(
                    "h-3.5 w-3.5",
                    !runtimeConnected
                      ? ""
                      : alertErrors > 0
                        ? "text-red-500"
                        : alertWarnings > 0
                          ? "text-yellow-500"
                          : ""
                  )} />
                  {runtimeConnected ? (
                    <span className={cn(
                      "tabular-nums",
                      alertErrors > 0 ? "text-red-500" : alertWarnings > 0 ? "text-yellow-500" : "text-muted-foreground/70"
                    )}>{alertCount}</span>
                  ) : (
                    <span className="text-muted-foreground/70">—</span>
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {!runtimeConnected
                  ? "Runtime (not connected)"
                  : alertCount > 0
                    ? "Alerts"
                    : "All clear"}
              </TooltipContent>
            </Tooltip>
          )}

          {/* Settings - gear icon only */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => toggleRightPanel("settings")}
                className={cn(
                  "flex items-center justify-center w-6 h-6 rounded-md transition-colors",
                  rightPanel === "settings"
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                )}
              >
                <Gear weight="duotone" className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Settings</TooltipContent>
          </Tooltip>

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
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(`https://hands.app/w/${activeWorkbookId}`);
                        }}
                        className="p-1.5 rounded-md hover:bg-accent transition-colors"
                      >
                        <Copy weight="duotone" className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Copy link</TooltipContent>
                  </Tooltip>
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
        {isOnPage ? (
          /* Page view: collapsible sidebar + content */
          <>
            {/* Sidebar zone - collapses to thin strip, expands on hover */}
            <div
              onMouseEnter={handleMouseEnterLeftEdge}
              onMouseLeave={handleMouseLeaveSidebar}
              style={{ width: sidebarVisible || isResizing ? sidebarWidth : 24 }}
              className={cn(
                "shrink-0 relative transition-[width] duration-200 ease-out",
                isResizing && "transition-none"
              )}
            >
              {/* Page indicator dots (when collapsed) */}
              <div
                className={cn(
                  "absolute inset-0 flex flex-col items-center gap-0.5 pt-4",
                  "transition-opacity duration-200",
                  sidebarVisible ? "opacity-0 pointer-events-none" : "opacity-100"
                )}
              >
                {Array.from({ length: Math.min(pageCount, 5) }).map((_, i) => (
                  <div
                    key={i}
                    className={cn(
                      "w-1 h-1 rounded-full transition-colors",
                      manifest?.pages?.[i]?.id === pageId ? "bg-foreground/60" : "bg-foreground/15"
                    )}
                  />
                ))}
                {pageCount > 5 && (
                  <span className="text-[8px] text-muted-foreground/80 mt-0.5">+{pageCount - 5}</span>
                )}
              </div>

              {/* Sidebar content (when expanded) */}
              <div
                className={cn(
                  "absolute inset-0 p-4 overflow-y-auto",
                  "transition-opacity duration-200 ease-out",
                  sidebarVisible
                    ? "opacity-100"
                    : "opacity-0 pointer-events-none"
                )}
              >
                <PagesSidebar collapsed={false} onAddPage={handleAddPage} />
              </div>

              {/* Resize handle - at the right edge */}
              <div
                onMouseDown={handleResizeStart}
                className={cn(
                  "absolute top-0 bottom-0 right-0 w-1 cursor-col-resize z-10",
                  "transition-opacity duration-200",
                  sidebarVisible
                    ? "opacity-100 hover:bg-border/50 active:bg-border"
                    : "opacity-0 pointer-events-none",
                  isResizing && "bg-border"
                )}
              />
            </div>

            {/* Main content */}
            <main className="flex-1 flex flex-col min-w-0 bg-background">
              <div className="flex-1 relative">
                <div className="absolute inset-0 pointer-events-none border border-black/[0.06] rounded-sm" />
                {children}
              </div>
            </main>
          </>
        ) : (
          /* Index view: getting started or sidebar navigation */
          <div className="flex-1 flex items-start justify-center overflow-y-auto">
            {showGettingStarted ? (
              <EmptyWorkbookState
                onImportFile={handleImportFile}
              />
            ) : (
              <div className="p-4 pt-8">
                <PagesSidebar collapsed={false} fullWidth onAddPage={handleAddPage} />
              </div>
            )}
          </div>
        )}
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

      {/* Hidden file input for import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.json,.parquet"
        onChange={handleFileSelected}
        className="hidden"
      />

      {/* File drop overlay for external drag & drop - disabled until runtime fully ready */}
      <FileDropOverlay
        onFileDrop={handleFileDrop}
        accept={[".csv", ".json", ".parquet"]}
        disabled={!activeWorkbookId || !isRuntimeReady}
      />

      {/* New workbook modal */}
      <NewWorkbookModal
        open={showNewWorkbookModal}
        onOpenChange={setShowNewWorkbookModal}
        onCreate={handleWorkbookCreate}
        isCreating={createWorkbook.isPending}
      />
    </div>
    </TooltipProvider>
  );
}
