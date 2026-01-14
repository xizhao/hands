"use client";

import { DotsSixVertical } from "@phosphor-icons/react";
import { DndPlugin, useDraggable, useDropLine } from "@platejs/dnd";
import { expandListItemsWithChildren } from "@platejs/list";
import { BlockSelectionPlugin } from "@platejs/selection/react";
import { getPluginByType, isType, KEYS, type Path, type TElement } from "platejs";
import {
  MemoizedChildren,
  type PlateEditor,
  type PlateElementProps,
  type RenderNodeWrapper,
  useEditorRef,
  useElement,
  usePluginOption,
  useSelected,
} from "platejs/react";
import React, { useCallback, useEffect, useRef } from "react";

import { cn } from "../lib/utils";

import { BlockMenu } from "./block-menu";
import { Button } from "./button";

// Edge detection threshold in pixels
const EDGE_THRESHOLD = 40;

// ============================================================================
// Column Width Utilities
// ============================================================================

/**
 * Calculate balanced column widths for a given number of columns.
 * Ensures widths sum to exactly 100%.
 */
function calculateBalancedWidths(columnCount: number): string[] {
  if (columnCount <= 0) return [];
  const baseWidth = Math.floor((100 / columnCount) * 1000) / 1000;
  const widths = new Array(columnCount).fill(`${baseWidth}%`);
  // Adjust last column to ensure sum is exactly 100%
  const sum = baseWidth * columnCount;
  if (sum !== 100) {
    const adjustment = 100 - sum;
    widths[columnCount - 1] = `${baseWidth + adjustment}%`;
  }
  return widths;
}

/**
 * Rebalance column widths when adding a new column.
 * Redistributes space proportionally.
 */
function rebalanceWidthsForNewColumn(currentWidths: string[]): string[] {
  return calculateBalancedWidths(currentWidths.length + 1);
}

// ============================================================================
// Drop Target Detection
// ============================================================================

type DropTargetType =
  | { type: "root-block"; direction: "left" | "right" }
  | { type: "column-group-edge"; direction: "left" | "right"; columnGroupPath: Path }
  | { type: "column-inner"; direction: "left" | "right"; columnPath: Path; columnGroupPath: Path }
  | null;

/**
 * Determine the drop target based on cursor position and element context.
 * Priority: column-group-edge > column-inner > root-block
 */
function detectDropTarget(
  editor: PlateEditor,
  element: TElement,
  path: Path,
  edgeDirection: "left" | "right",
): DropTargetType {
  // Check if this element is inside a column
  const columnEntry = editor.api.above({
    at: path,
    match: { type: editor.getType(KEYS.column) },
  });

  if (columnEntry) {
    const [_columnNode, columnPath] = columnEntry;
    const columnGroupEntry = editor.api.parent(columnPath);

    if (columnGroupEntry && columnGroupEntry[0].type === editor.getType(KEYS.columnGroup)) {
      const [columnGroupNode, columnGroupPath] = columnGroupEntry;
      const columns = columnGroupNode.children as TElement[];
      const columnIndex = columnPath[columnPath.length - 1];

      // Check if we're at the outer edge of the column group
      const isFirstColumn = columnIndex === 0;
      const isLastColumn = columnIndex === columns.length - 1;

      if (
        (edgeDirection === "left" && isFirstColumn) ||
        (edgeDirection === "right" && isLastColumn)
      ) {
        // Outer edge of column group - append new column
        return { type: "column-group-edge", direction: edgeDirection, columnGroupPath };
      }

      // Inner edge - could add to adjacent column or insert between
      return {
        type: "column-inner",
        direction: edgeDirection,
        columnPath,
        columnGroupPath,
      };
    }
  }

  // Root level block - create new column group
  if (path.length === 1) {
    return { type: "root-block", direction: edgeDirection };
  }

  return null;
}

const UNDRAGGABLE_KEYS = [KEYS.column, KEYS.tr, KEYS.td, "claim"];

// Elements whose children (at any depth) should not be draggable
const NON_DRAGGABLE_ANCESTOR_TYPES = ["live_value", "claim"];

// Elements whose nested children should not show drag handles (but can still be dragged via other means)
const SUPPRESS_NESTED_GUTTER_TYPES = ["claim"];

/**
 * Check if any ancestor of the given path is a non-draggable type.
 * This prevents dragging elements out of LiveValue, etc.
 */
function hasNonDraggableAncestor(editor: PlateEditor, path: Path): boolean {
  let currentPath = path.slice(0, -1); // Start with parent
  while (currentPath.length > 0) {
    const ancestorEntry = editor.api.node(currentPath);
    if (ancestorEntry && NON_DRAGGABLE_ANCESTOR_TYPES.includes(ancestorEntry[0].type as string)) {
      return true;
    }
    currentPath = currentPath.slice(0, -1);
  }
  return false;
}

/**
 * Check if element should hide its drag gutter.
 * Claims don't show gutters (they have their own chevron toggle).
 * Elements nested inside Claims also don't show gutters.
 */
function shouldSuppressGutter(editor: PlateEditor, element: TElement, path: Path): boolean {
  // Claims themselves don't show gutters (they have chevron toggle)
  if (SUPPRESS_NESTED_GUTTER_TYPES.includes(element.type as string)) {
    return true;
  }

  // Elements nested inside Claims also don't show gutters
  if (path.length <= 1) return false;

  let currentPath = path.slice(0, -1); // Start with parent
  while (currentPath.length > 0) {
    const ancestorEntry = editor.api.node(currentPath);
    if (ancestorEntry && SUPPRESS_NESTED_GUTTER_TYPES.includes(ancestorEntry[0].type as string)) {
      return true;
    }
    currentPath = currentPath.slice(0, -1);
  }
  return false;
}

/**
 * Check if all ancestors up to root are container elements.
 * This enables dragging in deeply nested container structures (like nested Claims).
 */
function isInContainerChain(editor: PlateEditor, path: Path): boolean {
  if (path.length <= 1) return false;

  let currentPath = path.slice(0, -1); // Start with parent
  while (currentPath.length > 0) {
    const ancestorEntry = editor.api.node(currentPath);
    if (!ancestorEntry) return false;

    const plugin = getPluginByType(editor, ancestorEntry[0].type as string);
    if (!plugin?.node?.isContainer) {
      // If we hit root level (depth 1), allow dragging
      return currentPath.length === 1;
    }
    currentPath = currentPath.slice(0, -1);
  }
  return true;
}

export const BlockDraggable: RenderNodeWrapper = (props) => {
  const { editor, element, path } = props;

  const enabled = React.useMemo(() => {
    // Guard for static rendering (PlateStatic doesn't provide path)
    if (!path) return false;
    if (editor.dom.readOnly) return false;

    // Check if any ancestor is a non-draggable type (like LiveValue)
    if (hasNonDraggableAncestor(editor, path)) {
      return false;
    }

    if (isType(editor, element, UNDRAGGABLE_KEYS)) {
      return false;
    }

    // Root level blocks are always draggable
    if (path.length === 1) {
      return true;
    }

    // Enable dragging for elements nested in container chains (e.g., nested Claims)
    if (isInContainerChain(editor, path)) {
      return true;
    }

    // Enable dragging for children inside container elements (e.g., LiveAction)
    if (path.length === 2) {
      const parentEntry = editor.api.parent(path);
      if (parentEntry) {
        const parentPlugin = getPluginByType(editor, parentEntry[0].type as string);
        if (parentPlugin?.node?.isContainer) {
          return true;
        }
      }
    }

    // Inside columns
    if (path.length === 3) {
      const block = editor.api.some({
        at: path,
        match: { type: editor.getType(KEYS.column) },
      });
      if (block) return true;
    }

    // Inside tables
    if (path.length === 4) {
      const block = editor.api.some({
        at: path,
        match: { type: editor.getType(KEYS.table) },
      });
      if (block) return true;
    }

    return false;
  }, [editor, element, path]);

  if (!enabled) return;

  return (props) => <Draggable {...props} />;
};

// Track which edge the cursor is near during drag (for column creation)
type EdgeDirection = "left" | "right" | null;

// Global state for edge detection during drag
let globalDropTarget: DropTargetType = null;
let globalEdgeTargetId: string | null = null;

function Draggable(props: PlateElementProps) {
  const { children, editor, element, path } = props;
  const blockSelectionApi = editor.getApi(BlockSelectionPlugin).blockSelection;
  const containerRef = useRef<HTMLDivElement>(null);
  const [edgeDirection, setEdgeDirection] = React.useState<EdgeDirection>(null);

  // Check if cursor is near left/right edge of block
  const detectEdge = useCallback((clientX: number): EdgeDirection => {
    if (!containerRef.current) return null;
    const rect = containerRef.current.getBoundingClientRect();

    if (clientX - rect.left < EDGE_THRESHOLD) {
      return "left";
    }
    if (rect.right - clientX < EDGE_THRESHOLD) {
      return "right";
    }
    return null;
  }, []);

  // Handle drag over to detect edges
  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      const draggingId = editor.getOption(DndPlugin, "draggingId");
      if (!draggingId) return;

      // Don't allow dropping on self
      const dragIds = Array.isArray(draggingId) ? draggingId : [draggingId];
      if (dragIds.includes(element.id as string)) {
        setEdgeDirection(null);
        return;
      }

      const edge = detectEdge(e.clientX);
      setEdgeDirection(edge);

      // Update global state for drop handler
      if (edge) {
        const dropTarget = detectDropTarget(editor, element, path, edge);
        globalDropTarget = dropTarget;
        globalEdgeTargetId = element.id as string;
      } else if (globalEdgeTargetId === element.id) {
        globalDropTarget = null;
        globalEdgeTargetId = null;
      }
    },
    [detectEdge, editor, element, path],
  );

  const handleDragLeave = useCallback(() => {
    setEdgeDirection(null);
    if (globalEdgeTargetId === element.id) {
      globalDropTarget = null;
      globalEdgeTargetId = null;
    }
  }, [element.id]);

  const draggableResult = useDraggable({
    element,
    onDropHandler: (targetEditor, { dragItem }) => {
      const id = (dragItem as { id: string[] | string }).id;
      const dragIds = Array.isArray(id) ? id : [id];

      // Check if this is a horizontal drop for column operations
      if (globalDropTarget && globalEdgeTargetId === element.id) {
        // Get the dragged element (only support single element for column ops)
        const draggedElement =
          dragIds.length === 1
            ? (editor.api.node({ id: dragIds[0] })?.[0] as TElement | undefined)
            : undefined;

        if (draggedElement && draggedElement.id !== element.id) {
          const dragPath = editor.api.findPath(draggedElement);
          if (!dragPath) return;

          const dropTarget = globalDropTarget;

          // Handle different drop target types
          if (dropTarget.type === "root-block") {
            // Create new column group from two root-level blocks
            const targetPath = editor.api.findPath(element);
            if (!targetPath) return;

            editor.tf.withoutNormalizing(() => {
              // Remove the dragged element first
              editor.tf.removeNodes({ at: dragPath });

              // Recalculate target path after removal
              const newTargetPath = editor.api.findPath(element);
              if (!newTargetPath) return;

              // Create column group with both elements
              const leftElement = dropTarget.direction === "left" ? draggedElement : element;
              const rightElement = dropTarget.direction === "left" ? element : draggedElement;

              // Replace target with column group containing both
              editor.tf.removeNodes({ at: newTargetPath });
              editor.tf.insertNodes(
                {
                  type: KEYS.columnGroup,
                  children: [
                    {
                      type: KEYS.column,
                      width: "50%",
                      children: [{ ...leftElement }],
                    },
                    {
                      type: KEYS.column,
                      width: "50%",
                      children: [{ ...rightElement }],
                    },
                  ],
                },
                { at: newTargetPath, select: true },
              );
            });
          } else if (dropTarget.type === "column-group-edge") {
            // Append new column to existing column group
            const columnGroupEntry = editor.api.node(dropTarget.columnGroupPath);
            if (!columnGroupEntry) return;

            const [columnGroup] = columnGroupEntry;
            const columns = (columnGroup as TElement).children as TElement[];
            const currentWidths = columns.map(
              (col) => (col.width as string) || `${100 / columns.length}%`,
            );
            const newWidths = rebalanceWidthsForNewColumn(currentWidths);

            editor.tf.withoutNormalizing(() => {
              // Remove the dragged element first
              editor.tf.removeNodes({ at: dragPath });

              // Recalculate column group path after removal
              const newColumnGroupPath = editor.api.findPath(columnGroup);
              if (!newColumnGroupPath) return;

              // Update existing column widths
              const updatedColumnGroup = editor.api.node(newColumnGroupPath);
              if (!updatedColumnGroup) return;

              const updatedColumns = (updatedColumnGroup[0] as TElement).children as TElement[];
              updatedColumns.forEach((col, index) => {
                const colPath = [...newColumnGroupPath, index];
                editor.tf.setNodes({ width: newWidths[index] }, { at: colPath });
              });

              // Insert new column at the appropriate position
              const newColumnPath =
                dropTarget.direction === "left"
                  ? [...newColumnGroupPath, 0]
                  : [...newColumnGroupPath, updatedColumns.length];

              editor.tf.insertNodes(
                {
                  type: KEYS.column,
                  width: newWidths[newWidths.length - 1],
                  children: [{ ...draggedElement }],
                },
                { at: newColumnPath, select: true },
              );
            });
          } else if (dropTarget.type === "column-inner") {
            // Insert column between existing columns
            const columnGroupEntry = editor.api.node(dropTarget.columnGroupPath);
            if (!columnGroupEntry) return;

            const [columnGroup] = columnGroupEntry;
            const columns = (columnGroup as TElement).children as TElement[];
            const currentColumnIndex = dropTarget.columnPath[dropTarget.columnPath.length - 1];
            const currentWidths = columns.map(
              (col) => (col.width as string) || `${100 / columns.length}%`,
            );
            const newWidths = rebalanceWidthsForNewColumn(currentWidths);

            editor.tf.withoutNormalizing(() => {
              // Remove the dragged element first
              editor.tf.removeNodes({ at: dragPath });

              // Recalculate column group path after removal
              const newColumnGroupPath = editor.api.findPath(columnGroup);
              if (!newColumnGroupPath) return;

              // Update existing column widths
              const updatedColumnGroup = editor.api.node(newColumnGroupPath);
              if (!updatedColumnGroup) return;

              const updatedColumns = (updatedColumnGroup[0] as TElement).children as TElement[];
              updatedColumns.forEach((col, index) => {
                const colPath = [...newColumnGroupPath, index];
                editor.tf.setNodes({ width: newWidths[index] }, { at: colPath });
              });

              // Calculate insert position
              const insertIndex =
                dropTarget.direction === "right" ? currentColumnIndex + 1 : currentColumnIndex;
              const newColumnPath = [...newColumnGroupPath, insertIndex];

              editor.tf.insertNodes(
                {
                  type: KEYS.column,
                  width: newWidths[newWidths.length - 1],
                  children: [{ ...draggedElement }],
                },
                { at: newColumnPath, select: true },
              );
            });
          }

          // Clear edge state
          globalDropTarget = null;
          globalEdgeTargetId = null;
          setEdgeDirection(null);
          resetPreview();
          return;
        }
      }

      // Default behavior - add to selection
      if (blockSelectionApi) {
        blockSelectionApi.add(id);
      }

      resetPreview();
    },
  });

  const { isAboutToDrag, isDragging, nodeRef, previewRef, handleRef } = draggableResult;

  const isInColumn = path.length === 3;
  const isInTable = path.length === 4;
  const hideGutter = shouldSuppressGutter(editor, element, path);

  const [previewTop, setPreviewTop] = React.useState(0);

  const resetPreview = () => {
    if (previewRef.current) {
      previewRef.current.replaceChildren();
      previewRef.current?.classList.add("hidden");
    }
  };

  // clear up virtual multiple preview when drag end
  useEffect(() => {
    if (!isDragging) {
      resetPreview();
      setEdgeDirection(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDragging, resetPreview]);

  useEffect(() => {
    if (isAboutToDrag) {
      previewRef.current?.classList.remove("opacity-0");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAboutToDrag, previewRef.current?.classList.remove]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative",
        isDragging && "opacity-50",
        getPluginByType(editor, element.type)?.node.isContainer ? "group/container" : "group",
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      {!isInTable && !hideGutter && (
        <Gutter>
          <div
            className={cn(
              "slate-blockToolbarWrapper",
              "flex h-[1.5em]",
              isInColumn && "h-4",
              isInTable && "mt-1 size-4",
            )}
          >
            <div
              className={cn(
                "slate-blockToolbar",
                "pointer-events-auto mr-1 flex items-center gap-0.5",
                isInColumn && "mr-1.5",
              )}
            >
              <Button
                className="h-6 w-6 p-0"
                data-plate-prevent-deselect
                ref={handleRef}
                variant="ghost"
              >
                <DragHandle
                  isDragging={isDragging}
                  previewRef={previewRef}
                  resetPreview={resetPreview}
                  setPreviewTop={setPreviewTop}
                />
              </Button>
            </div>
          </div>
        </Gutter>
      )}

      <div
        className={cn("-left-0 absolute hidden w-full")}
        contentEditable={false}
        ref={previewRef}
        style={{ top: `${-previewTop}px` }}
      />

      <div
        className="slate-blockWrapper my-px flow-root"
        onContextMenu={(event) =>
          editor.getApi(BlockSelectionPlugin).blockSelection.addOnContextMenu({ element, event })
        }
        ref={nodeRef}
      >
        <MemoizedChildren>{children}</MemoizedChildren>
        <DropLine id={element.id as string} hidden={!!edgeDirection} />
        <VerticalDropLine direction={edgeDirection} />
      </div>
    </div>
  );
}

function Gutter({ children, className, ...props }: React.ComponentProps<"div">) {
  const editor = useEditorRef();
  const element = useElement();
  const isSelectionAreaVisible = usePluginOption(BlockSelectionPlugin, "isSelectionAreaVisible");
  const selected = useSelected();

  return (
    <div
      {...props}
      className={cn(
        "slate-gutterLeft",
        "-translate-x-full absolute top-1/2 -translate-y-1/2 z-50 flex cursor-text hover:opacity-100 sm:opacity-0",
        getPluginByType(editor, element.type)?.node.isContainer
          ? "group-hover/container:opacity-100"
          : "group-hover:opacity-100",
        isSelectionAreaVisible && "hidden",
        !selected && "opacity-0",
        className,
      )}
      contentEditable={false}
    >
      {children}
    </div>
  );
}

const DragHandle = React.memo(function DragHandle({
  isDragging,
  previewRef,
  resetPreview,
  setPreviewTop,
}: {
  isDragging: boolean;
  previewRef: React.RefObject<HTMLDivElement | null>;
  resetPreview: () => void;
  setPreviewTop: (top: number) => void;
}) {
  const editor = useEditorRef();
  const element = useElement();

  return (
    <BlockMenu animateZoom id={element.id as string} placement="left">
      <div
        className="flex size-full items-center justify-center"
        data-plate-prevent-deselect
        onMouseDown={(e) => {
          resetPreview();

          if (e.button !== 0 || e.shiftKey) return; // Only left mouse button

          const blockSelection = editor
            .getApi(BlockSelectionPlugin)
            .blockSelection.getNodes({ sort: true });

          let selectionNodes =
            blockSelection.length > 0 ? blockSelection : editor.api.blocks({ mode: "highest" });

          // If current block is not in selection, use it as the starting point
          if (!selectionNodes.some(([node]) => node.id === element.id)) {
            selectionNodes = [[element, editor.api.findPath(element)!]];
          }

          // Process selection nodes to include list children
          const blocks = expandListItemsWithChildren(editor, selectionNodes).map(([node]) => node);

          if (blockSelection.length === 0) {
            editor.tf.blur();
            editor.tf.collapse();
          }

          const elements = createDragPreviewElements(editor, blocks);
          previewRef.current?.append(...elements);
          previewRef.current?.classList.remove("hidden");
          previewRef.current?.classList.add("opacity-0");
          editor.setOption(DndPlugin, "multiplePreviewRef", previewRef);

          editor
            .getApi(BlockSelectionPlugin)
            .blockSelection.add(blocks.map((block) => block.id as string));
        }}
        onMouseEnter={() => {
          if (isDragging) return;

          const blockSelection = editor
            .getApi(BlockSelectionPlugin)
            .blockSelection.getNodes({ sort: true });

          let selectedBlocks =
            blockSelection.length > 0 ? blockSelection : editor.api.blocks({ mode: "highest" });

          // If current block is not in selection, use it as the starting point
          if (!selectedBlocks.some(([node]) => node.id === element.id)) {
            selectedBlocks = [[element, editor.api.findPath(element)!]];
          }

          // Process selection to include list children
          const processedBlocks = expandListItemsWithChildren(editor, selectedBlocks);

          const ids = processedBlocks.map((block) => block[0].id as string);

          if (ids.length > 1 && ids.includes(element.id as string)) {
            const previewTop = calculatePreviewTop(editor, {
              blocks: processedBlocks.map((block) => block[0]),
              element,
            });
            setPreviewTop(previewTop);
          } else {
            setPreviewTop(0);
          }
        }}
        onMouseUp={() => {
          resetPreview();
        }}
        role="button"
      >
        <DotsSixVertical className="size-4 text-muted-foreground" weight="bold" />
      </div>
    </BlockMenu>
  );
});

const DropLine = React.memo(function DropLine({
  className,
  hidden,
  id,
  ...props
}: React.ComponentProps<"div"> & { hidden?: boolean; id?: string }) {
  const { dropLine } = useDropLine({ id });

  if (!dropLine || hidden) return null;

  return (
    <div
      {...props}
      className={cn(
        "slate-dropLine",
        "absolute inset-x-0 h-0.5 opacity-100 transition-opacity",
        "bg-primary/50",
        dropLine === "top" && "-top-px",
        dropLine === "bottom" && "-bottom-px",
        className,
      )}
    />
  );
});

/**
 * Vertical drop line for column creation.
 * Shows when dragging near the left or right edge of a block.
 */
const VerticalDropLine = React.memo(function VerticalDropLine({
  direction,
  className,
  ...props
}: React.ComponentProps<"div"> & { direction: EdgeDirection }) {
  if (!direction) return null;

  return (
    <div
      {...props}
      className={cn(
        "slate-dropLine-vertical",
        "absolute inset-y-0 w-0.5 opacity-100 transition-opacity",
        "bg-primary",
        direction === "left" && "left-0",
        direction === "right" && "right-0",
        className,
      )}
    />
  );
});

const createDragPreviewElements = (editor: PlateEditor, blocks: TElement[]): HTMLElement[] => {
  const elements: HTMLElement[] = [];
  const ids: string[] = [];

  /**
   * Remove data attributes from the element to avoid recognized as slate
   * elements incorrectly.
   */
  const removeDataAttributes = (element: HTMLElement) => {
    Array.from(element.attributes).forEach((attr) => {
      if (attr.name.startsWith("data-slate") || attr.name.startsWith("data-block-id")) {
        element.removeAttribute(attr.name);
      }
    });

    Array.from(element.children).forEach((child) => {
      removeDataAttributes(child as HTMLElement);
    });
  };

  const resolveElement = (node: TElement, index: number) => {
    const domNode = editor.api.toDOMNode(node)!;
    const newDomNode = domNode.cloneNode(true) as HTMLElement;

    // Apply visual compensation for horizontal scroll
    const applyScrollCompensation = (original: Element, cloned: HTMLElement) => {
      const scrollLeft = original.scrollLeft;

      if (scrollLeft > 0) {
        // Create a wrapper to handle the scroll offset
        const scrollWrapper = document.createElement("div");
        scrollWrapper.style.overflow = "hidden";
        scrollWrapper.style.width = `${original.clientWidth}px`;

        // Create inner container with the full content
        const innerContainer = document.createElement("div");
        innerContainer.style.transform = `translateX(-${scrollLeft}px)`;
        innerContainer.style.width = `${original.scrollWidth}px`;

        // Move all children to the inner container
        while (cloned.firstChild) {
          innerContainer.append(cloned.firstChild);
        }

        // Apply the original element's styles to maintain appearance
        const originalStyles = window.getComputedStyle(original);
        cloned.style.padding = "0";
        innerContainer.style.padding = originalStyles.padding;

        scrollWrapper.append(innerContainer);
        cloned.append(scrollWrapper);
      }
    };

    applyScrollCompensation(domNode, newDomNode);

    ids.push(node.id as string);
    const wrapper = document.createElement("div");
    wrapper.append(newDomNode);
    wrapper.style.display = "flow-root";

    const lastDomNode = blocks[index - 1];

    if (lastDomNode) {
      const lastDomNodeRect = editor.api
        .toDOMNode(lastDomNode)
        ?.parentElement?.getBoundingClientRect();

      const domNodeRect = domNode.parentElement?.getBoundingClientRect();

      if (!domNodeRect || !lastDomNodeRect) return;

      const distance = domNodeRect.top - lastDomNodeRect.bottom;

      // Check if the two elements are adjacent (touching each other)
      if (distance > 15) {
        wrapper.style.marginTop = `${distance}px`;
      } else {
        // DIFF with plate
        wrapper.style.marginTop = "1px";
      }
    }

    removeDataAttributes(newDomNode);
    elements.push(wrapper);
  };

  for (let index = 0; index < blocks.length; index++) {
    resolveElement(blocks[index], index);
  }

  editor.setOption(DndPlugin, "draggingId", ids);

  return elements;
};

const calculatePreviewTop = (
  editor: PlateEditor,
  {
    blocks,
    element,
  }: {
    blocks: TElement[];
    element: TElement;
  },
): number => {
  const child = editor.api.toDOMNode(element)!;
  const editable = editor.api.toDOMNode(editor)!;
  const firstSelectedChild = blocks[0];

  const firstDomNode = editor.api.toDOMNode(firstSelectedChild)!;
  // Get editor's top padding
  const editorPaddingTop = Number(window.getComputedStyle(editable).paddingTop.replace("px", ""));

  // Calculate distance from first selected node to editor top
  const firstNodeToEditorDistance =
    firstDomNode.getBoundingClientRect().top -
    editable.getBoundingClientRect().top -
    editorPaddingTop;

  // Get margin top of first selected node
  const firstMarginTopString = window.getComputedStyle(firstDomNode).marginTop;
  const marginTop = Number(firstMarginTopString.replace("px", ""));

  // Calculate distance from current node to editor top
  const currentToEditorDistance =
    child.getBoundingClientRect().top - editable.getBoundingClientRect().top - editorPaddingTop;

  const currentMarginTopString = window.getComputedStyle(child).marginTop;
  const currentMarginTop = Number(currentMarginTopString.replace("px", ""));

  const previewElementsTopDistance =
    currentToEditorDistance - firstNodeToEditorDistance + marginTop - currentMarginTop;

  return previewElementsTopDistance;
};
