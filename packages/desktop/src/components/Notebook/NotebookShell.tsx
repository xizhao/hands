/**
 * NotebookShell - Linear-style layout with hover sidebar + titlebar
 *
 * Layout:
 * - Top: macOS-style titlebar with window controls, notebook switcher, status
 * - Left: Hover-reveal sidebar for pages + data chips
 * - Main: Full-screen editor
 * - Floating chat overlay
 */

import { useEffect, useRef, useCallback, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useUIStore } from "@/stores/ui";
import { useWorkbooks, useCreateWorkbook, useOpenWorkbook, useUpdateWorkbook, RuntimeStatus } from "@/hooks/useWorkbook";
import type { Workbook } from "@/lib/workbook";
import { useSessions } from "@/hooks/useSession";
import { startSSESync } from "@/lib/sse";
import { useDbSync } from "@/store/db-hooks";
import { queryClient } from "@/App";
import type { ChangeRecord } from "@/store/db-hooks";
import { cn } from "@/lib/utils";

import { PagesSidebar } from "./sidebar/PagesSidebar";
import { WorkbookEditor } from "./editor/WorkbookEditor";
import { ChatBar } from "@/components/ChatBar";
import { Thread } from "@/components/legacy/Thread";
import { LiveIndicator } from "./LiveIndicator";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import {
  ChevronDown,
  Plus,
  Check,
} from "lucide-react";

export function NotebookApp() {
  // Start SSE sync on mount
  useEffect(() => {
    const cleanup = startSSESync(queryClient);
    return cleanup;
  }, []);

  // Track if DB browser has been opened for this session
  const dbBrowserOpenedRef = useRef(false);

  // Handle new database changes
  const handleDbChange = useCallback((change: ChangeRecord) => {
    if (dbBrowserOpenedRef.current) return;
    const runtimePort = useUIStore.getState().runtimePort;
    const workbookId = useUIStore.getState().activeWorkbookId;
    if (runtimePort && workbookId) {
      console.log("[notebook] DB change:", change.op, change.table);
      dbBrowserOpenedRef.current = true;
    }
  }, []);

  // Start database change SSE subscription
  useDbSync(handleDbChange);

  const { activeSessionId, activeWorkbookId, setActiveSession, setActiveWorkbook } = useUIStore();
  const { data: sessions, isLoading: sessionsLoading } = useSessions();
  const { data: workbooks, isLoading: workbooksLoading } = useWorkbooks();
  const createWorkbook = useCreateWorkbook();
  const openWorkbook = useOpenWorkbook();
  const updateWorkbook = useUpdateWorkbook();

  // Current workbook
  const currentWorkbook = workbooks?.find((w) => w.id === activeWorkbookId);

  // Sidebar hover state (invisible until hover on left edge)
  const [sidebarVisible, setSidebarVisible] = useState(false);
  const sidebarTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Handle mouse entering left edge area
  const handleMouseEnterLeftEdge = useCallback(() => {
    if (sidebarTimeoutRef.current) clearTimeout(sidebarTimeoutRef.current);
    setSidebarVisible(true);
  }, []);

  // Handle mouse leaving sidebar
  const handleMouseLeaveSidebar = useCallback(() => {
    sidebarTimeoutRef.current = setTimeout(() => {
      setSidebarVisible(false);
    }, 300);
  }, []);

  // Workbook title editing state
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState("");
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Track initialization
  const initialized = useRef(false);
  const initializingRef = useRef(false);

  // On startup: check Tauri for active runtime, or start one
  useEffect(() => {
    if (initialized.current || initializingRef.current) return;
    if (workbooksLoading || workbooks === undefined) return;
    if (createWorkbook.isPending || openWorkbook.isPending) return;

    initializingRef.current = true;

    invoke<RuntimeStatus | null>("get_active_runtime").then((active) => {
      if (active) {
        console.log("[notebook] Tauri has active runtime:", active.workbook_id);
        setActiveWorkbook(active.workbook_id, active.directory);
        initialized.current = true;
        initializingRef.current = false;
        return;
      }

      console.log("[notebook] No active runtime, starting one...");

      if (workbooks.length > 0) {
        const mostRecent = workbooks[0];
        console.log("[notebook] Opening most recent workbook:", mostRecent.id);
        setActiveWorkbook(mostRecent.id, mostRecent.directory);
        openWorkbook.mutate(mostRecent, {
          onSettled: () => {
            initialized.current = true;
            initializingRef.current = false;
          }
        });
      } else {
        createWorkbook.mutate(
          { name: "My Workbook" },
          {
            onSuccess: (workbook) => {
              console.log("[notebook] Created new workbook:", workbook.id);
              setActiveWorkbook(workbook.id, workbook.directory);
              openWorkbook.mutate(workbook, {
                onSettled: () => {
                  initialized.current = true;
                  initializingRef.current = false;
                }
              });
            },
            onError: () => {
              initialized.current = true;
              initializingRef.current = false;
            }
          }
        );
      }
    }).catch((err) => {
      console.error("[notebook] Failed to check active runtime:", err);
      initialized.current = true;
      initializingRef.current = false;
    });
  }, [workbooks, workbooksLoading, setActiveWorkbook, createWorkbook, openWorkbook]);

  // Clear activeSessionId if it points to a deleted session
  useEffect(() => {
    if (sessionsLoading || !sessions) return;
    if (activeSessionId && !sessions.some(s => s.id === activeSessionId)) {
      setActiveSession(null);
    }
  }, [sessions, sessionsLoading, activeSessionId, setActiveSession]);

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

  // Page count for indicator
  const pageCount = 3; // Mock - will come from PagesSidebar data

  // Chat state
  const [chatExpanded, setChatExpanded] = useState(false);

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden relative">
      {/* Subtle 1px inset border on overall window - matches macOS ~10px corner radius */}
      <div className="absolute inset-0 pointer-events-none z-50 border border-white/[0.08] dark:border-white/[0.06]" style={{ borderRadius: '10px' }} />

      {/* macOS Titlebar - traffic lights at x:16 y:18 in tauri.conf.json */}
      <header
        data-tauri-drag-region
        className="h-11 flex items-center pl-[80px] pr-4 border-b border-border/50 bg-background shrink-0"
      >
        {/* Unified control group: title + status dot + dropdown chevron */}
        <div className="flex items-center gap-0 group/titlebar">
          {/* Editable title - contentEditable for natural width */}
          <span
            ref={titleInputRef as React.RefObject<HTMLSpanElement>}
            contentEditable
            suppressContentEditableWarning
            onFocus={() => {
              setIsEditingTitle(true);
            }}
            onBlur={(e) => {
              const newName = e.currentTarget.textContent?.trim() || "";
              if (currentWorkbook && newName && newName !== currentWorkbook.name) {
                updateWorkbook.mutate({
                  ...currentWorkbook,
                  name: newName,
                  updated_at: Date.now(),
                });
              }
              setIsEditingTitle(false);
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

          {/* Workbook switcher dropdown - just a chevron */}
          <DropdownMenu>
            <DropdownMenuTrigger className={cn(
              "flex items-center justify-center w-5 h-5 rounded-sm transition-all",
              "text-muted-foreground/50 hover:text-muted-foreground hover:bg-accent/50",
              "opacity-0 group-hover/titlebar:opacity-100 focus:opacity-100"
            )}>
              <ChevronDown className="h-3 w-3" />
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
                    <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                  )}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleCreateWorkbook}>
                <Plus className="h-3.5 w-3.5 mr-2" />
                <span className="text-[13px]">New Notebook</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Main layout with inline sidebar */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar zone - takes up space when visible, pushes content */}
        <div
          onMouseEnter={handleMouseEnterLeftEdge}
          onMouseLeave={handleMouseLeaveSidebar}
          className={cn(
            "shrink-0 flex flex-col transition-all duration-200 ease-out",
            sidebarVisible ? "w-[160px]" : "w-6"
          )}
        >
          {/* Page indicator dots (when collapsed) - aligned to top where pages appear */}
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
                  i === 0 ? "bg-foreground/40" : "bg-foreground/15"
                )}
              />
            ))}
            {pageCount > 5 && (
              <span className="text-[8px] text-muted-foreground/60 mt-0.5">+{pageCount - 5}</span>
            )}
          </div>

          {/* Pages list (when expanded) - positioned at top */}
          <div
            className={cn(
              "absolute left-0 top-[44px] px-3 pt-4",
              "transition-all duration-200 ease-out",
              sidebarVisible
                ? "opacity-100 translate-x-0"
                : "opacity-0 -translate-x-2 pointer-events-none"
            )}
          >
            <PagesSidebar collapsed={false} />
          </div>
        </div>

        {/* Main content area */}
        <main className="flex-1 flex flex-col min-w-0 bg-background">
          <div className="flex-1 relative">
            {/* Subtle 1px inset border like Linear - slightly more visible */}
            <div className="absolute inset-0 pointer-events-none border border-black/[0.06] rounded-sm" />
            <WorkbookEditor />
          </div>
        </main>
      </div>

      {/* Floating chat - bottom-up layout */}
      <div className="fixed bottom-4 left-4 right-4 z-50 max-w-2xl mx-auto flex flex-col">
        {/* Thread (chips + messages) - grows upward */}
        <Thread
          expanded={chatExpanded}
          onCollapse={() => setChatExpanded(false)}
          onExpand={() => setChatExpanded(true)}
        />

        {/* ChatBar (input) - always at bottom */}
        <ChatBar
          expanded={chatExpanded}
          onExpandChange={setChatExpanded}
        />
      </div>
    </div>
  );
}

