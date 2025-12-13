/**
 * Drag Select - Area/box selection for the overlay editor
 *
 * Allows users to click and drag to select multiple elements.
 * Similar to desktop file selection or Figma's selection box.
 */

import { useCallback, useEffect, useRef, useState } from "react";

interface DragSelectProps {
  containerRef: React.RefObject<HTMLElement | null>;
  onSelect: (nodeIds: string[]) => void;
  disabled?: boolean;
}

interface SelectionBox {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

export function DragSelect({ containerRef, onSelect, disabled }: DragSelectProps) {
  const [box, setBox] = useState<SelectionBox | null>(null);
  const isDraggingRef = useRef(false);
  const startPointRef = useRef<{ x: number; y: number } | null>(null);

  // Minimum drag distance before we start selection (prevents accidental drags)
  const MIN_DRAG_DISTANCE = 5;

  const handleMouseDown = useCallback(
    (e: MouseEvent) => {
      if (disabled) return;

      // Only start drag on left click
      if (e.button !== 0) return;

      // Don't start drag if clicking on an element with data-node-id
      // (those clicks are handled by the element click handler)
      const target = e.target as HTMLElement;
      if (target.closest("[data-node-id]")) return;

      // Don't start if clicking on drag handles or other UI
      if (target.closest('.drag-handle, button, [role="button"]')) return;

      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      startPointRef.current = {
        x: e.clientX - rect.left + container.scrollLeft,
        y: e.clientY - rect.top + container.scrollTop,
      };
    },
    [containerRef, disabled],
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!startPointRef.current) return;

      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const currentX = e.clientX - rect.left + container.scrollLeft;
      const currentY = e.clientY - rect.top + container.scrollTop;

      const distance = Math.sqrt(
        (currentX - startPointRef.current.x) ** 2 + (currentY - startPointRef.current.y) ** 2,
      );

      // Start showing selection box after minimum drag distance
      if (!isDraggingRef.current && distance >= MIN_DRAG_DISTANCE) {
        isDraggingRef.current = true;
      }

      if (isDraggingRef.current) {
        setBox({
          startX: startPointRef.current.x,
          startY: startPointRef.current.y,
          currentX,
          currentY,
        });
      }
    },
    [containerRef],
  );

  const handleMouseUp = useCallback(() => {
    if (box && containerRef.current) {
      // Calculate selection rectangle
      const left = Math.min(box.startX, box.currentX);
      const top = Math.min(box.startY, box.currentY);
      const right = Math.max(box.startX, box.currentX);
      const bottom = Math.max(box.startY, box.currentY);

      // Find all elements that intersect with the selection box
      const elements = containerRef.current.querySelectorAll("[data-node-id]");
      const container = containerRef.current;
      const containerRect = container.getBoundingClientRect();

      const selectedIds: string[] = [];

      elements.forEach((el) => {
        const elRect = el.getBoundingClientRect();
        // Convert to container-relative coordinates (accounting for scroll)
        const elLeft = elRect.left - containerRect.left + container.scrollLeft;
        const elTop = elRect.top - containerRect.top + container.scrollTop;
        const elRight = elLeft + elRect.width;
        const elBottom = elTop + elRect.height;

        // Check intersection
        const intersects = left < elRight && right > elLeft && top < elBottom && bottom > elTop;

        if (intersects) {
          const nodeId = el.getAttribute("data-node-id");
          if (nodeId) {
            selectedIds.push(nodeId);
          }
        }
      });

      if (selectedIds.length > 0) {
        onSelect(selectedIds);
      }
    }

    // Reset state
    setBox(null);
    isDraggingRef.current = false;
    startPointRef.current = null;
  }, [box, containerRef, onSelect]);

  // Attach event listeners
  useEffect(() => {
    const container = containerRef.current;
    if (!container || disabled) return;

    container.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      container.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [containerRef, disabled, handleMouseDown, handleMouseMove, handleMouseUp]);

  // Don't render anything if not dragging
  if (!box) return null;

  // Calculate display rectangle
  const left = Math.min(box.startX, box.currentX);
  const top = Math.min(box.startY, box.currentY);
  const width = Math.abs(box.currentX - box.startX);
  const height = Math.abs(box.currentY - box.startY);

  return (
    <div
      className="absolute pointer-events-none border border-blue-500 bg-blue-500/10 z-50"
      style={{
        left,
        top,
        width,
        height,
      }}
    />
  );
}
