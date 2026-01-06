/**
 * ResizableLayout - 2-column layout with resizable sidebar
 *
 * Shared between web and desktop.
 * Provides a docked sidebar with drag-to-resize handle.
 */

import { type ReactNode } from "react";
import { useResizable } from "@/hooks/useResizable";
import { cn } from "@/lib/utils";

export interface ResizableLayoutProps {
  /** Sidebar content */
  sidebar: ReactNode;
  /** Main content */
  children: ReactNode;
  /** Initial sidebar width (default: 280) */
  defaultWidth?: number;
  /** Minimum sidebar width (default: 200) */
  minWidth?: number;
  /** Maximum sidebar width (default: 500) */
  maxWidth?: number;
  /** Callback when width changes */
  onWidthChange?: (width: number) => void;
  /** Additional class name for container */
  className?: string;
}

export function ResizableLayout({
  sidebar,
  children,
  defaultWidth = 280,
  minWidth = 200,
  maxWidth = 500,
  onWidthChange,
  className,
}: ResizableLayoutProps) {
  const { width, isResizing, handleResizeStart } = useResizable({
    initialWidth: defaultWidth,
    minWidth,
    maxWidth,
    onWidthChange,
  });

  return (
    <div className={cn("flex h-full overflow-hidden", className)}>
      {/* Sidebar */}
      <div
        style={{ width }}
        className="shrink-0 flex flex-col h-full relative border-r border-border/50"
      >
        {sidebar}

        {/* Resize handle */}
        <div
          onMouseDown={handleResizeStart}
          className={cn(
            "absolute top-0 bottom-0 right-0 w-1 cursor-col-resize z-10",
            "hover:bg-primary/20 active:bg-primary/30",
            isResizing && "bg-primary/30"
          )}
        />
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0 overflow-hidden">{children}</div>
    </div>
  );
}
