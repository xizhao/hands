/**
 * NotebookShell - Linear-style layout with hover sidebar + titlebar
 *
 * Layout:
 * - Top: macOS-style titlebar with window controls, notebook switcher, breadcrumb, status
 * - Left: Hover-reveal sidebar for pages + data chips (only when on a page route)
 * - Main: Routed content (full sidebar or editor)
 * - Floating chat overlay
 */

import {
  CaretDown,
  Check,
  CircleNotch,
  Copy,
  Database,
  FloppyDisk,
  Gear,
  Link as LinkIcon,
  Plus,
  Warning,
  X,
} from "@phosphor-icons/react";
import { useRouter, useRouterState } from "@tanstack/react-router";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { ChatBar } from "@/components/ChatBar";
import { FileDropOverlay } from "@/components/FileDropOverlay";
import { NewWorkbookModal } from "@/components/NewWorkbookModal";
import { Thread } from "@/components/Notebook/Thread";
import { SaveStatusIndicator } from "@/components/SaveStatusIndicator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useChatState } from "@/hooks/useChatState";
import { useNeedsTrafficLightOffset } from "@/hooks/useFullscreen";
import { useActiveSession, useClearNavigation, useRightPanel } from "@/hooks/useNavState";
import { useRuntimeState } from "@/hooks/useRuntimeState";
import { useImportWithAgent } from "@/hooks/useSession";
import {
  useCreateWorkbook,
  useEvalResult,
  useOpenWorkbook,
  useSaveDatabase,
  useUpdateWorkbook,
  useWorkbooks,
} from "@/hooks/useWorkbook";
import { cn } from "@/lib/utils";
import type { Workbook } from "@/lib/workbook";
import { RightPanel } from "./panels/RightPanel";
import { NotebookSidebar } from "./sidebar/NotebookSidebar";

interface NotebookShellProps {
  children: ReactNode;
}

export function NotebookShell({ children }: NotebookShellProps) {
  const router = useRouter();
  // Get route info from current router state - use useRouterState for reactive updates
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;
  // Check if we're on a block editor route and extract blockId
  const blockMatch = currentPath.match(/^\/blocks\/(.+)$/);
  const blockId = blockMatch?.[1];
  const isOnBlock = !!blockId;
  // Check if we're on a source viewer route and extract sourceId
  const sourceMatch = currentPath.match(/^\/sources\/(.+)$/);
  const sourceId = sourceMatch?.[1];
  const isOnSource = !!sourceId;
  // Check if we're on a table data route and extract tableId
  const tableMatch = currentPath.match(/^\/tables\/(.+)$/);
  const tableId = tableMatch?.[1];
  const isOnTable = !!tableId;
  // Check if we're on any content route (block, source, or table) that needs the editor layout
  const isOnContentRoute = isOnBlock || isOnSource || isOnTable;

  // Consolidated runtime state - single source of truth
  const {
    workbookId: activeWorkbookId,
    port: runtimePort,
    manifest,
    schema: dbSchema,
    isDbReady,
    isDbBooting,
    isStarting,
    isFullyReady: _isFullyReady,
  } = useRuntimeState();

  const { panel: rightPanel, togglePanel: toggleRightPanel } = useRightPanel();
  const { setSession: setActiveSession } = useActiveSession();
  const clearNavigation = useClearNavigation();
  const needsTrafficLightOffset = useNeedsTrafficLightOffset();
  const { data: workbooks } = useWorkbooks();
  const createWorkbook = useCreateWorkbook();
  const openWorkbook = useOpenWorkbook();
  const updateWorkbook = useUpdateWorkbook();

  // Eval result (still separate - not part of runtime state machine)
  const { data: evalResult } = useEvalResult(activeWorkbookId);

  // Derive connection state from runtime state
  const isRuntimeReady = !!runtimePort;
  const isManifestLoading = !manifest && !!runtimePort;
  const isConnecting = isManifestLoading;
  const isDbLoading = isStarting || isDbBooting;

  // Runtime connection status
  const runtimeConnected = isRuntimeReady;
  const dbConnected = runtimeConnected && isDbReady;

  // Mutations for empty state actions
  const saveDatabase = useSaveDatabase();

  const tableCount = dbSchema?.length ?? 0;
  const _blockCount = manifest?.blocks?.length ?? 0;

  // Compute alert counts from eval result
  const alertErrors =
    (evalResult?.typescript?.errors?.length ?? 0) + (evalResult?.format?.errors?.length ?? 0);
  const alertWarnings = evalResult?.typescript?.warnings?.length ?? 0;
  const alertCount = alertErrors + alertWarnings;

  // Current workbook
  const currentWorkbook = workbooks?.find((w) => w.id === activeWorkbookId);

  // Current block (for breadcrumb)
  const currentBlock = manifest?.blocks?.find((b) => b.id === blockId);

  // Current source (for breadcrumb) - from manifest
  const currentSource = manifest?.sources?.find((s) => s.id === sourceId);

  // Current table (for breadcrumb) - from schema
  const currentTable = dbSchema?.find((t) => t.table_name === tableId);

  // Sidebar hover state (invisible until hover on left edge) - only used when on a page
  const [sidebarVisible, setSidebarVisible] = useState(false);
  const [sidebarPinned, setSidebarPinned] = useState(false);
  const [sidebarMenuOpen, setSidebarMenuOpen] = useState(false);
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
    // Don't hide while resizing, pinned, or menu is open
    if (isResizing || sidebarPinned || sidebarMenuOpen) return;
    sidebarTimeoutRef.current = setTimeout(() => {
      setSidebarVisible(false);
    }, 300);
  }, [isResizing, sidebarPinned, sidebarMenuOpen]);

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsResizing(true);
      resizeStartX.current = e.clientX;
      resizeStartWidth.current = sidebarWidth;
    },
    [sidebarWidth],
  );

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
      // Clear route state and navigate to / before switching workbooks
      clearNavigation();
      openWorkbook.mutate(workbook as Workbook);
    },
    [clearNavigation, openWorkbook],
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
            // Clear route state and navigate to / before opening new workbook
            clearNavigation();
            openWorkbook.mutate(newWorkbook);
            setShowNewWorkbookModal(false);
            // TODO: Apply template if templateId is provided
            if (templateId) {
              console.log(`Applying template: ${templateId}`);
            }
          },
        },
      );
    },
    [clearNavigation, createWorkbook, openWorkbook],
  );

  // Handle close page (navigate back to index)
  const handleClosePage = useCallback(() => {
    router.navigate({ to: "/" });
  }, [router]);

  // Hidden file input ref for import
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Chat state from hook - must be declared before callbacks that use it
  const chatState = useChatState();

  // Empty state handlers
  const _handleAddSource = useCallback(() => {
    // Open database panel where user can add sources
    toggleRightPanel("database");
  }, [toggleRightPanel]);

  const _handleImportFile = useCallback(() => {
    // Trigger file input click
    fileInputRef.current?.click();
  }, []);

  const handleFileSelected = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // Set as pending attachment
      chatState.setPendingAttachment({ type: "file", file, name: file.name });
      // Expand chat to show the attachment
      chatState.setChatExpanded(true);

      // Reset input so same file can be selected again
      e.target.value = "";
    },
    [chatState.setChatExpanded, chatState.setPendingAttachment],
  );

  // Auto-attach current block/source context when route changes
  // Note: We use a ref to check the current attachment type to avoid including
  // chatState.pendingAttachment in dependencies, which would cause infinite loops
  // (new object created each render → state change → re-render → repeat)
  const pendingAttachmentRef = useRef(chatState.pendingAttachment);
  pendingAttachmentRef.current = chatState.pendingAttachment;

  useEffect(() => {
    if (isOnBlock && blockId && currentBlock) {
      chatState.setPendingAttachment({
        type: "block",
        blockId,
        name: currentBlock.title || blockId,
      });
    } else if (isOnSource && sourceId && currentSource) {
      chatState.setPendingAttachment({
        type: "source",
        sourceId,
        name: currentSource.title || sourceId,
      });
    } else {
      // Clear attachment when navigating to index or other routes
      // Only clear if it's a block/source attachment (not a file)
      const current = pendingAttachmentRef.current;
      if (current?.type === "block" || current?.type === "source") {
        chatState.setPendingAttachment(null);
      }
    }
  }, [
    isOnBlock,
    isOnSource,
    blockId,
    sourceId,
    currentBlock,
    currentSource,
    chatState.setPendingAttachment,
  ]);

  // Import with agent hook for workspace drops
  const importWithAgent = useImportWithAgent();

  // New workbook modal state
  const [showNewWorkbookModal, setShowNewWorkbookModal] = useState(false);

  // File drop handler for external files
  // - Dropped on chatbar: attach file, expand chat, no auto-submit
  // - Dropped elsewhere (workspace): start background import with agent
  const handleFileDrop = useCallback(
    (file: File, dropTarget: Element | null) => {
      // Check if the drop target is inside the chatbar (has data-chat-bar attribute)
      const isOnChatbar = dropTarget?.closest("[data-chat-bar]") !== null;

      if (isOnChatbar) {
        // Chatbar drop: attach file, expand chat, but don't auto-submit
        console.log("[handleFileDrop] File dropped on chatbar, attaching:", file.name);
        chatState.setPendingAttachment({ type: "file", file, name: file.name });
        chatState.setChatExpanded(true);
        // Note: NOT setting autoSubmitPending - user must manually submit
      } else {
        // Workspace drop: start import with agent and focus on it
        console.log("[handleFileDrop] File dropped on workspace, starting import:", file.name);
        importWithAgent.mutate({
          file,
          onSessionCreated: (sessionId) => {
            console.log("[handleFileDrop] Import session created, focusing:", sessionId);
            // Focus on the import thread and expand chat
            setActiveSession(sessionId);
            chatState.setChatExpanded(true);
          },
        });
      }
    },
    [chatState, importWithAgent, setActiveSession],
  );

  return (
    <TooltipProvider delayDuration={300}>
      <div className="h-screen flex flex-col bg-background overflow-hidden relative">
        {/* Subtle 1px inset border on overall window - matches macOS ~10px corner radius */}
        <div
          className="absolute inset-0 pointer-events-none z-50 border border-white/[0.08] dark:border-white/[0.06]"
          style={{ borderRadius: "10px" }}
        />

        {/* macOS Titlebar - traffic lights at x:16 y:18 in tauri.conf.json */}
        <header
          data-tauri-drag-region
          className={cn(
            "h-11 flex items-center justify-between pr-4 border-b border-border/50 bg-background shrink-0",
            needsTrafficLightOffset ? "pl-[80px]" : "pl-4",
          )}
        >
          {/* Left: Workbook title + breadcrumb */}
          <div className="flex items-center gap-0 group/titlebar">
            {/* Save status indicator - circle to left of title */}
            <SaveStatusIndicator />

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
                "focus:bg-background focus:ring-1 focus:ring-ring/20",
              )}
              spellCheck={false}
            >
              {currentWorkbook?.name ?? "Untitled"}
            </span>

            {/* Workbook switcher dropdown - always visible */}
            <div className="relative flex items-center justify-center w-5 h-5">
              {/* Slash separator - only visible when on a content route, hidden on hover */}
              {isOnContentRoute && (
                <span className="text-muted-foreground/60 text-sm group-hover/titlebar:opacity-0 transition-opacity">
                  /
                </span>
              )}
              {/* Dropdown trigger - hidden by default (shows on hover), or always visible when not on content route */}
              <DropdownMenu>
                <DropdownMenuTrigger
                  className={cn(
                    "absolute inset-0 flex items-center justify-center rounded-sm transition-all",
                    "text-muted-foreground/70 hover:text-muted-foreground hover:bg-accent/50",
                    isOnContentRoute
                      ? "opacity-0 group-hover/titlebar:opacity-100 focus:opacity-100"
                      : "opacity-100",
                  )}
                >
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

            {/* Breadcrumb - show for block or source routes */}
            {isOnBlock && (
              <>
                <span
                  className={cn(
                    "px-1 py-0.5 text-sm text-muted-foreground bg-transparent rounded-sm",
                    "hover:bg-accent/50 hover:text-foreground",
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
            {isOnSource && (
              <>
                <span
                  className={cn(
                    "px-1 py-0.5 text-sm text-muted-foreground bg-transparent rounded-sm",
                    "hover:bg-accent/50 hover:text-foreground",
                  )}
                >
                  {currentSource?.title || sourceId}
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
                  <TooltipContent side="bottom">Close source</TooltipContent>
                </Tooltip>
              </>
            )}
            {isOnTable && (
              <>
                <span
                  className={cn(
                    "px-1 py-0.5 text-sm text-muted-foreground bg-transparent rounded-sm",
                    "hover:bg-accent/50 hover:text-foreground",
                  )}
                >
                  {currentTable?.table_name || tableId}
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
                  <TooltipContent side="bottom">Close table</TooltipContent>
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

            {/* Database - table browser with quick actions on hover when active */}
            {!isConnecting && (
              <HoverCard openDelay={0} closeDelay={100}>
                <HoverCardTrigger asChild>
                  <button
                    onClick={() => toggleRightPanel("database")}
                    className={cn(
                      "flex items-center gap-1 px-1.5 py-1 rounded-md text-[11px] transition-colors",
                      rightPanel === "database"
                        ? "bg-accent text-foreground"
                        : dbConnected && tableCount > 0
                          ? "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                          : "text-muted-foreground/70 hover:bg-accent/50 hover:text-muted-foreground",
                    )}
                  >
                    <Database
                      weight="duotone"
                      className={cn(
                        "h-3.5 w-3.5",
                        !isDbLoading && dbConnected && tableCount > 0 && "text-blue-500",
                      )}
                    />
                    {isDbLoading ? (
                      <div className="w-4 h-3 bg-muted/50 rounded animate-pulse" />
                    ) : (
                      <span
                        className={cn(
                          "tabular-nums",
                          dbConnected && tableCount > 0
                            ? "text-foreground"
                            : "text-muted-foreground/70",
                        )}
                      >
                        {tableCount}
                      </span>
                    )}
                  </button>
                </HoverCardTrigger>
                <HoverCardContent side="bottom" align="center" className="w-auto p-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      saveDatabase.mutate();
                    }}
                    disabled={saveDatabase.isPending || !dbConnected || isDbLoading}
                    className={cn(
                      "flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors",
                      "hover:bg-accent text-muted-foreground hover:text-foreground",
                      "disabled:opacity-50 disabled:cursor-not-allowed",
                    )}
                  >
                    {saveDatabase.isPending ? (
                      <CircleNotch weight="bold" className="h-3 w-3 animate-spin" />
                    ) : (
                      <FloppyDisk weight="duotone" className="h-3 w-3" />
                    )}
                    <span>{saveDatabase.isPending ? "Saving..." : "Save"}</span>
                  </button>
                </HoverCardContent>
              </HoverCard>
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
                            : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                    )}
                  >
                    <Warning
                      weight="duotone"
                      className={cn(
                        "h-3.5 w-3.5",
                        !runtimeConnected
                          ? ""
                          : alertErrors > 0
                            ? "text-red-500"
                            : alertWarnings > 0
                              ? "text-yellow-500"
                              : "",
                      )}
                    />
                    {runtimeConnected ? (
                      <span
                        className={cn(
                          "tabular-nums",
                          alertErrors > 0
                            ? "text-red-500"
                            : alertWarnings > 0
                              ? "text-yellow-500"
                              : "text-muted-foreground/70",
                        )}
                      >
                        {alertCount}
                      </span>
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
                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
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
                            navigator.clipboard.writeText(
                              `https://hands.app/w/${activeWorkbookId}`,
                            );
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
                  isResizing && "transition-none",
                )}
              >
                {/* Spine indicators (when collapsed) - squares: blocks, triangles: sources */}
                <div
                  className={cn(
                    "absolute inset-0 flex flex-col items-center pt-4",
                    "transition-opacity duration-200",
                    sidebarShown ? "opacity-0 pointer-events-none" : "opacity-100",
                  )}
                >
                  {/* Blocks - squares */}
                  {manifest?.blocks && manifest.blocks.length > 0 && (
                    <div className="flex flex-col items-center gap-1">
                      {manifest.blocks.slice(0, 3).map((block) => (
                        <div
                          key={`block-${block.id}`}
                          className={cn(
                            "w-1.5 h-1.5 transition-colors",
                            block.id === blockId ? "bg-foreground/60" : "bg-foreground/15",
                          )}
                        />
                      ))}
                    </div>
                  )}
                  {/* Sources - triangles (CSS triangles via border) */}
                  {manifest?.sources && manifest.sources.length > 0 && (
                    <div className="flex flex-col items-center gap-1 mt-2">
                      {manifest.sources.slice(0, 3).map((source) => (
                        <div
                          key={`source-${source.id}`}
                          className={cn(
                            "w-0 h-0 border-l-[3px] border-r-[3px] border-b-[5px] border-l-transparent border-r-transparent transition-colors",
                            source.id === sourceId
                              ? "border-b-foreground/60"
                              : "border-b-foreground/15",
                          )}
                        />
                      ))}
                    </div>
                  )}
                  {/* Data/Tables - circles */}
                  {dbSchema && dbSchema.length > 0 && (
                    <div className="flex flex-col items-center gap-1 mt-2">
                      {dbSchema.slice(0, 3).map((table) => (
                        <div
                          key={`table-${table.table_name}`}
                          className={cn(
                            "w-1.5 h-1.5 rounded-full transition-colors",
                            table.table_name === tableId ? "bg-foreground/60" : "bg-foreground/15",
                          )}
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
                    sidebarShown ? "opacity-100" : "opacity-0 pointer-events-none",
                  )}
                >
                  <NotebookSidebar
                    collapsed={false}
                    pinned={sidebarPinned}
                    onPinnedChange={setSidebarPinned}
                    onMenuOpenChange={setSidebarMenuOpen}
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
                    isResizing && "bg-border",
                  )}
                />
              </div>

              {/* Main content */}
              <main className="flex-1 flex flex-col min-w-0 bg-background">
                <div className="flex-1 relative">{children}</div>
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

        {/* Floating chat - bottom-up layout, shifts right when sidebar is open on content routes */}
        {!chatState.chatBarHidden && (
          <div
            className="fixed bottom-4 right-4 z-50 max-w-2xl mx-auto flex flex-col transition-[left] duration-200"
            style={{ left: isOnContentRoute && sidebarShown ? sidebarWidth + 16 : 16 }}
          >
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
        )}

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
