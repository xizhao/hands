/**
 * NotebookShell - Arc-style layout with permanent sidebar
 *
 * Layout:
 * - Left: Sidebar with workbook header + chat + browse (always visible, resizable)
 * - Right: Content area with header (breadcrumb + actions) + routed content
 * - Right panel overlay for database, settings, alerts
 */

import { FileDropOverlay } from "@/components/FileDropOverlay";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ATTACHMENT_TYPE, useChatState } from "@/hooks/useChatState";
import { useSidebarWidth } from "@/hooks/useNavState";
import { usePrefetchOnDbReady, useRuntimeState } from "@/hooks/useRuntimeState";
import { cn } from "@/lib/utils";
import { useRouterState } from "@tanstack/react-router";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { UnifiedSidebar } from "../sidebar/UnifiedSidebar";
import { ContentHeader } from "./ContentHeader";
import { RightPanel } from "./panels/RightPanel";

// ============================================================================
// Main Component
// ============================================================================

interface NotebookShellProps {
  children: ReactNode;
}

export function NotebookShell({ children }: NotebookShellProps) {
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

  // Sidebar width state (resizable, persisted across navigation)
  const { width: sidebarWidth, setWidth: setSidebarWidth } = useSidebarWidth();
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartX = useRef(0);
  const resizeStartWidth = useRef(0);

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
    [sidebarWidth]
  );

  useEffect(() => {
    if (!isResizing) return;

    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - resizeStartX.current;
      const newWidth = Math.min(
        Math.max(resizeStartWidth.current + delta, 200),
        500
      );
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
    [chatState]
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
    [chatState]
  );

  return (
    <TooltipProvider delayDuration={300}>
      <div className="h-screen flex bg-background overflow-hidden relative">
        <div
          className="absolute inset-0 pointer-events-none z-50 border border-black/[0.04] dark:border-white/[0.03]"
          style={{ borderRadius: "10px" }}
        />

        {/* Left: Sidebar (full width when empty, otherwise resizable) */}
        <div
          style={{ width: isFullscreenSidebar ? "100%" : sidebarWidth }}
          className={cn(
            "shrink-0 flex flex-col h-full relative",
            isResizing && "transition-none"
          )}
        >
          <UnifiedSidebar />

          {/* Resize handle - only when not in empty state */}
          {!isFullscreenSidebar && (
            <div
              onMouseDown={handleResizeStart}
              className={cn(
                "absolute top-0 bottom-0 right-0 w-1 cursor-col-resize z-10",
                "hover:bg-border/50 active:bg-border",
                isResizing && "bg-border"
              )}
            />
          )}
        </div>

        {/* Right: Content area - hidden when empty workbook */}
        {!isFullscreenSidebar && (
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            {/* Content header with breadcrumb and actions */}
            <ContentHeader />

            {/* Main content - routed */}
            <main className="flex-1 min-h-0 overflow-hidden">
              {isOnIndex ? (
                // Index route - full content area
                <div className="h-full">{children}</div>
              ) : (
                // Content routes - inset border style
                <div className="h-full p-2 pl-1">
                  <div className="h-full rounded-lg border border-border/40 bg-background overflow-hidden shadow-sm">
                    {children}
                  </div>
                </div>
              )}
            </main>
          </div>
        )}

        {/* Right panel overlay */}
        <RightPanel />

        {/* Hidden file input for import */}
        <input
          ref={fileInputRef}
          type="file"
          accept="*/*"
          onChange={handleFileSelected}
          className="hidden"
        />

        {/* File drop overlay for external drag & drop */}
        <FileDropOverlay
          onFileDrop={handleFileDrop}
          disabled={!activeWorkbookId}
        />
      </div>
    </TooltipProvider>
  );
}
