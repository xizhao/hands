/**
 * useResizable - Hook for resizable panel logic
 *
 * Provides mouse-based resize functionality with min/max constraints.
 * Used by ResizableLayout and WebShell.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export interface UseResizableOptions {
  /** Initial width in pixels */
  initialWidth?: number;
  /** Minimum width constraint */
  minWidth?: number;
  /** Maximum width constraint */
  maxWidth?: number;
  /** Callback when width changes */
  onWidthChange?: (width: number) => void;
}

export interface UseResizableReturn {
  /** Current width */
  width: number;
  /** Whether currently resizing */
  isResizing: boolean;
  /** Mouse down handler for resize handle */
  handleResizeStart: (e: React.MouseEvent) => void;
}

export function useResizable({
  initialWidth = 280,
  minWidth = 200,
  maxWidth = 500,
  onWidthChange,
}: UseResizableOptions = {}): UseResizableReturn {
  const [width, setWidth] = useState(initialWidth);
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartX = useRef(0);
  const resizeStartWidth = useRef(0);

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsResizing(true);
      resizeStartX.current = e.clientX;
      resizeStartWidth.current = width;
    },
    [width]
  );

  useEffect(() => {
    if (!isResizing) return;

    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - resizeStartX.current;
      const newWidth = Math.min(Math.max(resizeStartWidth.current + delta, minWidth), maxWidth);
      setWidth(newWidth);
      onWidthChange?.(newWidth);
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
  }, [isResizing, minWidth, maxWidth, onWidthChange]);

  return { width, isResizing, handleResizeStart };
}
