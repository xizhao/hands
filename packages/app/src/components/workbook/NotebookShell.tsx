/**
 * NotebookShell - Arc-style layout with permanent sidebar
 *
 * Layout:
 * - Left: Sidebar with workbook header + chat + browse (always visible, resizable)
 * - Right: Content area with header (breadcrumb + actions) + routed content
 * - Right panel overlay for database, settings, alerts
 */

import { useRouterState } from "@tanstack/react-router";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { FileDropOverlay } from "@/components/FileDropOverlay";
import { useSidebarStateSync } from "@/components/sidebar/notebook/hooks/useSidebarState";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ATTACHMENT_TYPE, useChatState, useChatStateSync } from "@/hooks/useChatState";
import { useEditorStateSync, useSidebarMode, useSidebarWidth } from "@/hooks/useNavState";
import { usePrefetchOnDbReady, useRuntimeState } from "@/hooks/useRuntimeState";
import { cn } from "@/lib/utils";
import { UnifiedSidebar } from "../sidebar/UnifiedSidebar";
import { ContentHeader } from "./ContentHeader";
import { HeaderActionsProvider } from "./HeaderActionsContext";

// ============================================================================
// Main Component
// ============================================================================

interface NotebookShellProps {
  children: ReactNode;
}

export function NotebookShell({ children }: NotebookShellProps) {
  // Initialize state from server (called once per workbook mount)
  useEditorStateSync();
  useSidebarStateSync();
  useChatStateSync();

  // Get route info
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;
  const isOnIndex = currentPath === "/";

  // Runtime state
  const { workbookId: activeWorkbookId } = useRuntimeState();

  // On index route, sidebar takes full width (no content area needed)
  const isFullscreenSidebar = isOnIndex;

  // Prefetch schema when DB becomes ready
  usePrefetchOnDbReady();

  // Chat state for file drop handling
  const chatState = useChatState();

  // Sidebar width and mode state (resizable, persisted across navigation)
  const { width: sidebarWidth, setWidth: setSidebarWidth } = useSidebarWidth();
  const { mode: sidebarMode } = useSidebarMode();
  const [isResizing, setIsResizing] = useState(false);
  const [isFloatingHovered, setIsFloatingHovered] = useState(false);
  const resizeStartX = useRef(0);
  const resizeStartWidth = useRef(0);

  const isFloating = sidebarMode === "floating";

  // Hidden file input ref for import
  const fileInputRef = useRef<HTMLInputElement>(null);

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
  }, [isResizing, setSidebarWidth]);

  // File drop handler
  const handleFileDrop = useCallback(
    (filePath: string) => {
      const fileName = filePath.split("/").pop() || filePath;
      chatState.setPendingAttachment({
        type: ATTACHMENT_TYPE.FILEPATH,
        filePath,
        name: fileName,
      });
      chatState.setChatExpanded(true);
      chatState.setAutoSubmitPending(true);
    },
    [chatState],
  );

  // File selection handler
  const handleFileSelected = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      chatState.setPendingAttachment({
        type: ATTACHMENT_TYPE.FILE,
        file,
        name: file.name,
      });
      chatState.setChatExpanded(true);
      e.target.value = "";
    },
    [chatState],
  );

  return (
    <TooltipProvider delayDuration={300}>
      <HeaderActionsProvider>
        <div className="h-screen flex bg-surface overflow-hidden relative">
          <div
            className="absolute inset-0 pointer-events-none z-50 border border-black/[0.04] dark:border-white/[0.03]"
            style={{ borderRadius: "10px" }}
          />

          {/* Floating mode: hover trigger zone */}
          {isFloating && !isFullscreenSidebar && (
            <div
              className="absolute top-0 left-0 bottom-0 w-2 z-40"
              onMouseEnter={() => setIsFloatingHovered(true)}
            />
          )}

          <div
            style={{
              width: isFullscreenSidebar ? "100%" : sidebarWidth,
              // In floating mode, don't reserve space in the layout
              ...(isFloating && !isFullscreenSidebar ? { width: sidebarWidth } : {}),
            }}
            className={cn(
              "flex flex-col h-full relative",
              !isFloating && "shrink-0",
              isFloating && !isFullscreenSidebar && [
                "absolute top-2 bottom-2 left-2 z-30",
                "rounded-xl border border-border/60 bg-surface",
                "shadow-xl shadow-black/10 dark:shadow-black/30",
                "transition-transform duration-200 ease-out",
                !isFloatingHovered && "-translate-x-[calc(100%+8px)]",
              ],
            )}
            onMouseEnter={() => isFloating && setIsFloatingHovered(true)}
            onMouseLeave={() => isFloating && setIsFloatingHovered(false)}
          >
            <UnifiedSidebar floating={isFloating} />

            {/* Resize handle - only when not in floating or empty state */}
            {!isFullscreenSidebar && !isFloating && (
              <div
                onMouseDown={handleResizeStart}
                className={cn(
                  "absolute top-0 bottom-0 right-0 w-1 cursor-col-resize z-10",
                  "hover:bg-border/50 active:bg-border",
                  isResizing && "bg-border",
                )}
              />
            )}
          </div>

          <div
            className={cn(
              "flex-1 flex flex-col min-w-0 overflow-hidden",
              isFullscreenSidebar && "hidden",
              // In floating mode, content takes full width
              isFloating && "pl-1",
            )}
          >
            <ContentHeader />
            <main className="flex-1 min-h-0 overflow-hidden">
              <div
                className={cn(
                  "h-full pr-2 pb-2",
                  // Adjust left padding based on floating mode
                  isFloating ? "pl-1" : "pl-1",
                  // No top padding for domain routes - tabs connect directly
                  currentPath.startsWith("/domains/") ? "pt-0" : "pt-2",
                )}
              >
                <div
                  className={cn(
                    "h-full border border-border/40 bg-background overflow-hidden shadow-sm",
                    // Adjust rounding for domain routes - no top-right rounding where tabs are
                    currentPath.startsWith("/domains/")
                      ? "rounded-b-lg rounded-tl-lg"
                      : "rounded-lg",
                  )}
                >
                  {children}
                </div>
              </div>
            </main>
          </div>

          {/* Hidden file input for import */}
          <input
            ref={fileInputRef}
            type="file"
            accept="*/*"
            onChange={handleFileSelected}
            className="hidden"
          />

          {/* File drop overlay for external drag & drop */}
          <FileDropOverlay onFileDrop={handleFileDrop} disabled={!activeWorkbookId} />
        </div>
      </HeaderActionsProvider>
    </TooltipProvider>
  );
}
