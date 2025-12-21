/**
 * RSC Editor Drag and Drop Components
 *
 * Drag handles, drop zones, and indicators for the RSC editor.
 * Uses react-dnd with HTML5 backend.
 */

import { DotsSixVertical, Trash } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { useDrag, useDragLayer, useDrop } from "react-dnd";

// DnD item type
export const ELEMENT_TYPE = "RSC_ELEMENT";

export interface DragItem {
  type: typeof ELEMENT_TYPE;
  nodeId: string;
}

// ============================================================================
// Drag Handle
// ============================================================================

interface DragHandleProps {
  nodeId: string;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onDelete: () => void;
  onHoverChange?: (isHovered: boolean) => void;
}

export function DragHandle({ nodeId, containerRef, onDelete, onHoverChange }: DragHandleProps) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Set up drag
  const [{ isDragging }, dragRef] = useDrag(
    () => ({
      type: ELEMENT_TYPE,
      item: { type: ELEMENT_TYPE, nodeId } as DragItem,
      collect: (monitor) => ({
        isDragging: monitor.isDragging(),
      }),
    }),
    [nodeId],
  );

  useEffect(() => {
    if (!containerRef.current) return;

    const element = containerRef.current.querySelector(`[data-node-id="${nodeId}"]`);
    if (!element) return;

    const updateRect = () => {
      const container = containerRef.current!;
      const containerRect = container.getBoundingClientRect();
      const elementRect = element.getBoundingClientRect();

      setRect(
        new DOMRect(
          elementRect.left - containerRect.left,
          elementRect.top - containerRect.top,
          elementRect.width,
          elementRect.height,
        ),
      );
    };

    updateRect();

    const observer = new ResizeObserver(updateRect);
    observer.observe(element);

    // Update on scroll to keep position accurate during scrolling
    const container = containerRef.current;
    container.addEventListener("scroll", updateRect);

    return () => {
      observer.disconnect();
      container.removeEventListener("scroll", updateRect);
    };
  }, [nodeId, containerRef]);

  // Close menu when clicking outside
  useEffect(() => {
    if (!menuOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  if (!rect) return null;

  return (
    <div
      className="absolute flex items-start z-50 transition-opacity"
      style={{
        left: rect.x - 28,
        top: rect.y,
        opacity: isDragging ? 0.5 : 1,
      }}
      onMouseEnter={() => onHoverChange?.(true)}
      onMouseLeave={() => {
        if (!menuOpen) {
          onHoverChange?.(false);
        }
      }}
    >
      {/* Drag handle with click menu */}
      <div className="relative" ref={menuRef}>
        <button
          ref={dragRef as any}
          className="size-6 p-0 flex items-center justify-center rounded hover:bg-gray-100 dark:hover:bg-gray-800 cursor-grab active:cursor-grabbing transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen(!menuOpen);
          }}
        >
          <DotsSixVertical className="size-4 text-gray-400" weight="bold" />
        </button>

        {/* Dropdown menu */}
        {menuOpen && (
          <div className="absolute left-0 top-full mt-1 bg-background border border-border rounded-md shadow-lg py-1 min-w-[120px] z-[100]">
            <button
              className="w-full px-3 py-1.5 text-left text-sm flex items-center gap-2 hover:bg-muted transition-colors text-red-500"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(false);
                onDelete();
              }}
            >
              <Trash className="size-4" />
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Helper: Check if target is descendant of source
// ============================================================================

function isDescendantOf(container: HTMLElement, sourceId: string, targetId: string): boolean {
  const sourceEl = container.querySelector(`[data-node-id="${sourceId}"]`);
  const targetEl = container.querySelector(`[data-node-id="${targetId}"]`);

  if (!sourceEl || !targetEl) return false;

  // Check if target is inside source (source contains target)
  return sourceEl.contains(targetEl);
}

// ============================================================================
// Drop Zone
// ============================================================================

interface DropZoneProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
  onDrop: (nodeId: string, targetId: string, position: "before" | "after" | "inside") => void;
}

export function DropZone({ containerRef, onDrop }: DropZoneProps) {
  const [dropInfo, setDropInfo] = useState<{
    targetId: string;
    position: "before" | "after";
    rect: DOMRect;
  } | null>(null);

  // Use drag layer to track dragging state globally
  const { isDragging, item } = useDragLayer((monitor) => ({
    isDragging: monitor.isDragging(),
    item: monitor.getItem() as DragItem | null,
  }));

  // Set up drop handler
  const [{ isOver }, dropRef] = useDrop(
    () => ({
      accept: ELEMENT_TYPE,
      hover: (dragItem: DragItem, monitor) => {
        if (!containerRef.current) return;

        const clientOffset = monitor.getClientOffset();
        if (!clientOffset) return;

        const containerRect = containerRef.current.getBoundingClientRect();

        // Raycast approach: get elements at cursor position in z-index order (top first)
        const elementsAtPoint = document.elementsFromPoint(clientOffset.x, clientOffset.y);

        // Find the topmost element with data-node-id that's inside our container
        let targetElement: Element | null = null;
        for (const el of elementsAtPoint) {
          if (containerRef.current.contains(el) && el.hasAttribute("data-node-id")) {
            targetElement = el;
            break;
          }
        }

        // If cursor is not directly over an element, find closest by Y
        if (!targetElement) {
          const elements = containerRef.current.querySelectorAll("[data-node-id]");
          let closestDistance = Infinity;

          elements.forEach((el) => {
            const elRect = el.getBoundingClientRect();
            const elMidY = elRect.top + elRect.height / 2;
            const distance = Math.abs(clientOffset.y - elMidY);
            if (distance < closestDistance) {
              closestDistance = distance;
              targetElement = el;
            }
          });
        }

        if (targetElement) {
          const targetId = targetElement.getAttribute("data-node-id")!;

          // Don't allow dropping on self
          if (targetId === dragItem.nodeId) {
            setDropInfo(null);
            return;
          }

          // Don't allow dropping a parent into its own descendant (would create cycle)
          if (isDescendantOf(containerRef.current, dragItem.nodeId, targetId)) {
            setDropInfo(null);
            return;
          }

          const elRect = targetElement.getBoundingClientRect();
          const elMidY = elRect.top + elRect.height / 2;
          const position: "before" | "after" = clientOffset.y < elMidY ? "before" : "after";

          setDropInfo({
            targetId,
            position,
            rect: new DOMRect(
              elRect.left - containerRect.left,
              position === "before"
                ? elRect.top - containerRect.top
                : elRect.bottom - containerRect.top,
              elRect.width,
              2,
            ),
          });
        }
      },
      drop: (dragItem: DragItem) => {
        if (dropInfo) {
          console.log("[DropZone] Drop:", {
            nodeId: dragItem.nodeId,
            targetId: dropInfo.targetId,
            position: dropInfo.position,
          });
          onDrop(dragItem.nodeId, dropInfo.targetId, dropInfo.position);
        }
        setDropInfo(null);
      },
      collect: (monitor) => ({
        isOver: monitor.isOver(),
      }),
    }),
    [containerRef, dropInfo, onDrop],
  );

  // Attach drop ref to container when it changes
  useEffect(() => {
    if (containerRef.current) {
      dropRef(containerRef.current);
    }
  }, [dropRef, containerRef.current]);

  // Clear drop info when not over
  useEffect(() => {
    if (!isOver) {
      setDropInfo(null);
    }
  }, [isOver]);

  // Only show indicator when dragging and over
  if (!isDragging || !isOver || !dropInfo) return null;

  return (
    <div
      className="absolute pointer-events-none bg-brand z-50 rounded-full"
      style={{
        left: dropInfo.rect.x,
        top: dropInfo.rect.y - 1,
        width: dropInfo.rect.width,
        height: 3,
      }}
    />
  );
}

// ============================================================================
// Node Highlight
// ============================================================================

interface NodeHighlightProps {
  nodeId: string;
  containerRef: React.RefObject<HTMLDivElement | null>;
  mode: "hover" | "select" | "editing";
}

export function NodeHighlight({ nodeId, containerRef, mode }: NodeHighlightProps) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const element = containerRef.current.querySelector(`[data-node-id="${nodeId}"]`);
    if (!element) return;

    const updateRect = () => {
      const container = containerRef.current!;
      const containerRect = container.getBoundingClientRect();
      const elementRect = element.getBoundingClientRect();

      setRect(
        new DOMRect(
          elementRect.left - containerRect.left,
          elementRect.top - containerRect.top,
          elementRect.width,
          elementRect.height,
        ),
      );
    };

    updateRect();

    // Update on scroll/resize to keep position accurate
    const observer = new ResizeObserver(updateRect);
    observer.observe(element);

    const container = containerRef.current;
    container.addEventListener("scroll", updateRect);

    return () => {
      observer.disconnect();
      container.removeEventListener("scroll", updateRect);
    };
  }, [nodeId, containerRef]);

  if (!rect) return null;

  if (mode === "hover") {
    // Subtle full overlay on hover
    return (
      <div
        className="absolute pointer-events-none transition-all duration-75 rounded-sm"
        style={{
          left: rect.x,
          top: rect.y,
          width: rect.width,
          height: rect.height,
          backgroundColor: "rgba(0, 0, 0, 0.03)",
        }}
      />
    );
  }

  if (mode === "editing") {
    // No visual indicator when editing - cursor in text is enough
    return null;
  }

  // Selection: small left border (Notion-style)
  return (
    <div
      className="absolute pointer-events-none transition-all duration-100"
      style={{
        left: rect.x - 3,
        top: rect.y,
        width: 3,
        height: rect.height,
        backgroundColor: "rgba(59, 130, 246, 0.6)",
        borderRadius: 2,
      }}
    />
  );
}
