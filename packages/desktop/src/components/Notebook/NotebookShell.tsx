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
import {
  useWorkbooks,
  useCreateWorkbook,
  useOpenWorkbook,
  useUpdateWorkbook,
  useDbSchema,
  useEvalResult,
  useCreatePage,
  useUpdatePageTitle,
  useRuntimePort,
  useManifest,
  useActiveWorkbookId,
} from "@/hooks/useWorkbook";
import { useRightPanel, useActiveSession } from "@/hooks/useNavState";
import { useChatState } from "@/hooks/useChatState";
import { useImportWithAgent } from "@/hooks/useSession";
import type { Workbook } from "@/lib/workbook";
import { cn } from "@/lib/utils";

import { DraftsSidebar } from "./sidebar/PagesSidebar";
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
  // Check if we're on a block editor route and extract blockId
  const blockMatch = currentPath.match(/^\/blocks\/(.+)$/);
  const blockId = blockMatch?.[1];
  const isOnBlock = !!blockId;
  // Check if we're on any content route (page or block) that needs the editor layout
  const isOnContentRoute = isOnPage || isOnBlock;

  const activeWorkbookId = useActiveWorkbookId();
  const { panel: rightPanel, togglePanel: toggleRightPanel } = useRightPanel();
  const { setSession: setActiveSession } = useActiveSession();
  const { data: workbooks } = useWorkbooks();
  const createWorkbook = useCreateWorkbook();
  const openWorkbook = useOpenWorkbook();
  const updateWorkbook = useUpdateWorkbook();

  // Data for titlebar indicators and empty state detection
  const { data: dbSchema } = useDbSchema(activeWorkbookId);
  const { data: evalResult } = useEvalResult(activeWorkbookId);

  // Get runtime state from hooks
  const runtimePort = useRuntimePort();
  const { data: manifest, isLoading: isManifestLoading } = useManifest();

  // Derive connection state from port and manifest
  const isRuntimeReady = !!runtimePort;
  const isConnecting = isManifestLoading && !!runtimePort;

  // Runtime connection status
  const runtimeConnected = isRuntimeReady;
  const dbConnected = runtimeConnected && !!runtimePort;

  // Mutations for empty state actions
  const createPage = useCreatePage();
  const updatePageTitle = useUpdatePageTitle();

  const tableCount = dbSchema?.length ?? 0;
  const blockCount = manifest?.blocks?.length ?? 0;
  const draftCount = manifest?.pages?.length ?? 0;

  // Compute alert counts from eval result
  const alertErrors = (evalResult?.typescript?.errors?.length ?? 0) + (evalResult?.format?.errors?.length ?? 0);
  const alertWarnings = evalResult?.typescript?.warnings?.length ?? 0;
  const alertCount = alertErrors + alertWarnings;


  // Current workbook
  const currentWorkbook = workbooks?.find((w) => w.id === activeWorkbookId);

  // Current page (for breadcrumb) - from manifest (filesystem source of truth)
  const currentPage = manifest?.pages?.find((p) => p.id === pageId);

  // Current block (for breadcrumb)
  const currentBlock = manifest?.blocks?.find((b) => b.id === blockId);

  // Sidebar hover state (invisible until hover on left edge) - only used when on a page
  const [sidebarVisible, setSidebarVisible] = useState(false);
  const [sidebarPinned, setSidebarPinned] = useState(false);
  const sidebarTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Sidebar width state (for resizing when expanded)
  const [sidebarWidth, setSidebarWidth] = useState(200);
  const [isResizing, setIsResizing] = useState(false);

  // Computed: sidebar is shown if pinned or hovered
  const sidebarShown = sidebarPinned || sidebarVisible;
  const resizeStartX = useRef(0);
  const resizeStartWidth = useRef(0);

  const handleMouseEnterLeftEdge = useCallback(() => {
    if (sidebarTimeoutRef.current) clearTimeout(sidebarTimeoutRef.current);
    setSidebarVisible(true);
  }, []);

  const handleMouseLeaveSidebar = useCallback(() => {
    // Don't hide while resizing or pinned
    if (isResizing || sidebarPinned) return;
    sidebarTimeoutRef.current = setTimeout(() => {
      setSidebarVisible(false);
    }, 300);
  }, [isResizing, sidebarPinned]);

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
  const handleSwitchWorkbook = useCallback(
    (workbook: { id: string; directory: string; name: string }) => {
      openWorkbook.mutate(workbook as Workbook);
    },
    [openWorkbook]
  );

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
    [createWorkbook, openWorkbook]
  );

  // Handle close page (navigate back to index)
  const handleClosePage = useCallback(() => {
    router.navigate({ to: "/" });
  }, [router]);

  // Hidden file input ref for import
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Empty state handlers
  const handleAddSource = useCallback(() => {
    // Open database panel where user can add sources
    toggleRightPanel("database");
  }, [toggleRightPanel]);


  const handleImportFile = useCallback(() => {
    // Trigger file input click
    fileInputRef.current?.click();
  }, []);

  const handleFileSelected = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Set as pending attachment
    chatState.setPendingAttachment({ type: "file", file, name: file.name });
    // Expand chat to show the attachment
    chatState.setChatExpanded(true);

    // Reset input so same file can be selected again
    e.target.value = "";
  }, []);

  const handleAddPage = useCallback(async () => {
    console.log("[handleAddPage] Creating page...");
    try {
      const result = await createPage.mutateAsync({ title: "Untitled" });
      console.log("[handleAddPage] Create result:", result);
      if (result.success && result.page) {
        // Navigate to the new page
        console.log("[handleAddPage] Navigating to page:", result.page.id);
        router.navigate({ to: "/page/$pageId", params: { pageId: result.page.id } });
      }
    } catch (err) {
      console.error("[handleAddPage] Failed to create page:", err);
      // TODO: Show toast notification on failure
    }
  }, [createPage, router]);

  // Chat state from hook
  const chatState = useChatState();

  // Auto-attach current page/block context when route changes
  useEffect(() => {
    if (isOnPage && pageId && currentPage) {
      chatState.setPendingAttachment({
        type: "page",
        pageId,
        name: currentPage.title || pageId,
      });
    } else if (isOnBlock && blockId && currentBlock) {
      chatState.setPendingAttachment({
        type: "block",
        blockId,
        name: currentBlock.title || blockId,
      });
    } else {
      // Clear attachment when navigating to index or other routes
      // Only clear if it's a page/block attachment (not a file)
      const current = chatState.pendingAttachment;
      if (current?.type === "page" || current?.type === "block") {
        chatState.setPendingAttachment(null);
      }
    }
  }, [isOnPage, isOnBlock, pageId, blockId, currentPage, currentBlock]);

  // Import with agent hook for workspace drops
  const importWithAgent = useImportWithAgent();

  // New workbook modal state
  const [showNewWorkbookModal, setShowNewWorkbookModal] = useState(false);

  // File drop handler for external files
  // - Dropped on chatbar: attach file, expand chat, no auto-submit
  // - Dropped elsewhere (workspace): start background import with agent
  const handleFileDrop = useCallback((file: File, dropTarget: Element | null) => {
    // Check if the drop target is inside the chatbar (has data-chat-bar attribute)
    const isOnChatbar = dropTarget?.closest("[data-chat-bar]") !== null;

    if (isOnChatbar) {
      // Chatbar drop: attach file, expand chat, but don't auto-submit
      console.log("[handleFileDrop] File dropped on chatbar, attaching:", file.name);
      chatState.setPendingAttachment({ type: "file", file, name: file.name });
      chatState.setChatExpanded(true);
      // Note: NOT setting autoSubmitPending - user must manually submit
    } else {
      // Workspace drop: start background import with agent (don't change focused thread)
      console.log("[handleFileDrop] File dropped on workspace, starting background import:", file.name);
      importWithAgent.mutate({
        file,
        // Don't set active session - let it run in background
        onSessionCreated: (sessionId) => {
          console.log("[handleFileDrop] Background import session created:", sessionId);
          // Could show a toast notification here
        },
      });
    }
  }, [chatState, importWithAgent]);

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
            {/* Slash separator - only visible when on a content route, hidden on hover */}
            {isOnContentRoute && (
              <span className="text-muted-foreground/60 text-sm group-hover/titlebar:opacity-0 transition-opacity">/</span>
            )}
            {/* Dropdown trigger - hidden by default (shows on hover), or always visible when not on content route */}
            <DropdownMenu>
              <DropdownMenuTrigger className={cn(
                "absolute inset-0 flex items-center justify-center rounded-sm transition-all",
                "text-muted-foreground/70 hover:text-muted-foreground hover:bg-accent/50",
                isOnContentRoute
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

          {/* Breadcrumb - show for page or block routes */}
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
          {isOnBlock && (
            <>
              <span
                className={cn(
                  "px-1 py-0.5 text-sm text-muted-foreground bg-transparent rounded-sm",
                  "hover:bg-accent/50 hover:text-foreground"
                )}
              >
                {currentBlock?.title || blockId}
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
                <TooltipContent side="bottom">Close block</TooltipContent>
              </Tooltip>
            </>
          )}
        </div>

        {/* Right: Panel toggles + Share */}
        <div className="flex items-center gap-1">
          {/* Loading shimmer when connecting to runtime */}
          {isConnecting && activeWorkbookId && (
            <div className="flex items-center gap-1 px-2 py-1">
              <div className="h-4 w-8 bg-muted/50 rounded animate-pulse" />
              <div className="h-4 w-8 bg-muted/50 rounded animate-pulse" />
            </div>
          )}

          {/* Database - table browser */}
          {!isConnecting && (
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
          {!isConnecting && (
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

      {/* Main layout - routes handle their own content */}
      <div className="flex-1 flex overflow-hidden">
        {isOnContentRoute ? (
          /* Content route (page/blocks): collapsible sidebar + content */
          <>
            {/* Sidebar zone - collapses to thin strip, expands on hover */}
            <div
              onMouseEnter={handleMouseEnterLeftEdge}
              onMouseLeave={handleMouseLeaveSidebar}
              style={{ width: sidebarShown || isResizing ? sidebarWidth : 24 }}
              className={cn(
                "shrink-0 relative transition-[width] duration-200 ease-out border-r border-border/50",
                isResizing && "transition-none"
              )}
            >
              {/* Spine indicators (when collapsed) - circles: pages, squares: blocks, triangles: sources */}
              <div
                className={cn(
                  "absolute inset-0 flex flex-col items-center pt-4",
                  "transition-opacity duration-200",
                  sidebarShown ? "opacity-0 pointer-events-none" : "opacity-100"
                )}
              >
                {/* Pages - circles */}
                {manifest?.pages && manifest.pages.length > 0 && (
                  <div className="flex flex-col items-center gap-1">
                    {manifest.pages.slice(0, 4).map((page) => (
                      <div
                        key={`page-${page.id}`}
                        className={cn(
                          "w-1.5 h-1.5 rounded-full transition-colors",
                          page.id === pageId ? "bg-foreground/60" : "bg-foreground/15"
                        )}
                      />
                    ))}
                  </div>
                )}
                {/* Blocks - squares */}
                {manifest?.blocks && manifest.blocks.length > 0 && (
                  <div className="flex flex-col items-center gap-1 mt-2">
                    {manifest.blocks.slice(0, 3).map((block) => (
                      <div
                        key={`block-${block.id}`}
                        className={cn(
                          "w-1.5 h-1.5 transition-colors",
                          block.id === blockId ? "bg-foreground/60" : "bg-foreground/15"
                        )}
                      />
                    ))}
                  </div>
                )}
                {/* Sources - triangles (CSS triangles via border) */}
                {dbSchema && dbSchema.length > 0 && (
                  <div className="flex flex-col items-center gap-1 mt-2">
                    {dbSchema.slice(0, 3).map((table) => (
                      <div
                        key={`source-${table.table_name}`}
                        className="w-0 h-0 border-l-[3px] border-r-[3px] border-b-[5px] border-l-transparent border-r-transparent border-b-foreground/15"
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Sidebar content (when expanded) */}
              <div
                className={cn(
                  "absolute inset-0 p-4 overflow-y-auto",
                  "transition-opacity duration-200 ease-out",
                  sidebarShown
                    ? "opacity-100"
                    : "opacity-0 pointer-events-none"
                )}
              >
                <DraftsSidebar
                  collapsed={false}
                  onAddDraft={handleAddPage}
                  pinned={sidebarPinned}
                  onPinnedChange={setSidebarPinned}
                />
              </div>

              {/* Resize handle - at the right edge */}
              <div
                onMouseDown={handleResizeStart}
                className={cn(
                  "absolute top-0 bottom-0 right-0 w-1 cursor-col-resize z-10",
                  "transition-opacity duration-200",
                  sidebarShown
                    ? "opacity-100 hover:bg-border/50 active:bg-border"
                    : "opacity-0 pointer-events-none",
                  isResizing && "bg-border"
                )}
              />
            </div>

            {/* Main content */}
            <main className="flex-1 flex flex-col min-w-0 bg-background">
              <div className="flex-1 relative">
                {children}
              </div>
            </main>
          </>
        ) : (
          /* Index route - let the route component handle its own layout */
          <main className="flex-1 flex flex-col min-w-0 bg-background overflow-hidden">
            {children}
          </main>
        )}
      </div>

      {/* Right panel overlay */}
      <RightPanel />

      {/* Floating chat - bottom-up layout */}
      <div className="fixed bottom-4 left-4 right-4 z-50 max-w-2xl mx-auto flex flex-col">
        <Thread
          expanded={chatState.chatExpanded}
          onCollapse={() => chatState.setChatExpanded(false)}
          onExpand={() => chatState.setChatExpanded(true)}
        />
        <ChatBar
          expanded={chatState.chatExpanded}
          onExpandChange={chatState.setChatExpanded}
          pendingAttachment={chatState.pendingAttachment}
          onPendingAttachmentChange={chatState.setPendingAttachment}
          autoSubmitPending={chatState.autoSubmitPending}
          onAutoSubmitPendingChange={chatState.setAutoSubmitPending}
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
