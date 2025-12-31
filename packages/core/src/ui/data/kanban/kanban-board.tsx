"use client";

/**
 * Kanban Board - Core drag-and-drop board component
 *
 * A simplified, accessible Kanban board built with @dnd-kit.
 * Inspired by DiceUI's Kanban component.
 */

import {
  closestCorners,
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";
import { cn } from "../../lib/utils";

// ============================================================================
// Types
// ============================================================================

export interface KanbanItem {
  id: string | number;
  [key: string]: unknown;
}

export interface KanbanBoardValue {
  [columnId: string]: KanbanItem[];
}

interface KanbanContextValue {
  activeItem: KanbanItem | null;
  activeColumn: string | null;
  draggingColumn: string | null;
}

interface KanbanColumnContextValue {
  columnId: string;
}

// ============================================================================
// Contexts
// ============================================================================

const KanbanContext = createContext<KanbanContextValue | null>(null);
const KanbanColumnContext = createContext<KanbanColumnContextValue | null>(null);

function _useKanbanContext() {
  const ctx = useContext(KanbanContext);
  if (!ctx) throw new Error("useKanbanContext must be used within KanbanBoard");
  return ctx;
}

function _useKanbanColumnContext() {
  const ctx = useContext(KanbanColumnContext);
  if (!ctx) throw new Error("useKanbanColumnContext must be used within KanbanColumn");
  return ctx;
}

// ============================================================================
// Main Board Component
// ============================================================================

export interface KanbanBoardProps {
  /** Board value: column ID → items array */
  value: KanbanBoardValue;
  /** Called when items are moved */
  onValueChange: (value: KanbanBoardValue) => void;
  /** Column order (defaults to Object.keys order) */
  columns: string[];
  /** Called when columns are reordered */
  onColumnsChange?: (columns: string[]) => void;
  /** Render function for column headers */
  renderColumnHeader: (columnId: string, items: KanbanItem[]) => ReactNode;
  /** Render function for cards */
  renderCard: (item: KanbanItem) => ReactNode;
  /** Optional class name */
  className?: string;
}

export function KanbanBoard({
  value,
  onValueChange,
  columns,
  onColumnsChange,
  renderColumnHeader,
  renderCard,
  className,
}: KanbanBoardProps) {
  const [activeItem, setActiveItem] = useState<KanbanItem | null>(null);
  const [activeColumn, setActiveColumn] = useState<string | null>(null);
  const [draggingColumn, setDraggingColumn] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // Column IDs use a prefix to distinguish from item IDs
  const columnIds = useMemo(() => columns.map((col) => `column:${col}`), [columns]);

  const isColumnId = useCallback(
    (id: string | number): boolean => String(id).startsWith("column:"),
    [],
  );

  const getColumnFromId = useCallback(
    (id: string | number): string => String(id).replace("column:", ""),
    [],
  );

  const findItemColumn = useCallback(
    (itemId: string | number): string | null => {
      for (const [columnId, items] of Object.entries(value)) {
        if (items.some((item) => item.id === itemId)) {
          return columnId;
        }
      }
      return null;
    },
    [value],
  );

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const { active } = event;
      const activeId = active.id;

      // Check if dragging a column
      if (isColumnId(activeId)) {
        setDraggingColumn(getColumnFromId(activeId));
        return;
      }

      // Dragging an item
      const column = findItemColumn(activeId);
      if (column) {
        const item = value[column]?.find((i) => i.id === activeId);
        if (item) {
          setActiveItem(item);
          setActiveColumn(column);
        }
      }
    },
    [findItemColumn, getColumnFromId, isColumnId, value],
  );

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const { active, over } = event;
      if (!over) return;

      const activeId = active.id;
      const overId = over.id;

      // Don't handle column drag in dragOver (only in dragEnd)
      if (isColumnId(activeId)) return;

      const activeCol = findItemColumn(activeId);
      // Check if over is a column or an item
      const overCol = isColumnId(overId)
        ? getColumnFromId(overId)
        : columns.includes(String(overId))
          ? String(overId)
          : findItemColumn(overId);

      if (!activeCol || !overCol || activeCol === overCol) return;

      // Move item to new column
      const newValue = { ...value };
      const activeItems = [...(newValue[activeCol] || [])];
      const overItems = [...(newValue[overCol] || [])];

      const activeIndex = activeItems.findIndex((i) => i.id === activeId);
      if (activeIndex === -1) return;

      const [movedItem] = activeItems.splice(activeIndex, 1);
      overItems.push(movedItem);

      newValue[activeCol] = activeItems;
      newValue[overCol] = overItems;

      onValueChange(newValue);
    },
    [columns, findItemColumn, getColumnFromId, isColumnId, onValueChange, value],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;

      // Reset state
      setActiveItem(null);
      setActiveColumn(null);
      setDraggingColumn(null);

      if (!over) return;

      const activeId = active.id;
      const overId = over.id;

      // Handle column reordering
      if (isColumnId(activeId) && isColumnId(overId)) {
        const activeCol = getColumnFromId(activeId);
        const overCol = getColumnFromId(overId);

        if (activeCol !== overCol && onColumnsChange) {
          const oldIndex = columns.indexOf(activeCol);
          const newIndex = columns.indexOf(overCol);
          if (oldIndex !== -1 && newIndex !== -1) {
            const newColumns = arrayMove(columns, oldIndex, newIndex);
            onColumnsChange(newColumns);
          }
        }
        return;
      }

      // Handle item reordering
      const activeCol = findItemColumn(activeId);
      const overCol = isColumnId(overId)
        ? getColumnFromId(overId)
        : columns.includes(String(overId))
          ? String(overId)
          : findItemColumn(overId);

      if (!activeCol || !overCol) return;

      if (activeCol === overCol && activeId !== overId) {
        // Reorder within same column
        const newValue = { ...value };
        const items = [...(newValue[activeCol] || [])];

        const activeIndex = items.findIndex((i) => i.id === activeId);
        const overIndex = items.findIndex((i) => i.id === overId);

        if (activeIndex !== -1 && overIndex !== -1) {
          const [movedItem] = items.splice(activeIndex, 1);
          items.splice(overIndex, 0, movedItem);
          newValue[activeCol] = items;
          onValueChange(newValue);
        }
      }
    },
    [columns, findItemColumn, getColumnFromId, isColumnId, onColumnsChange, onValueChange, value],
  );

  const contextValue = useMemo<KanbanContextValue>(
    () => ({ activeItem, activeColumn, draggingColumn }),
    [activeItem, activeColumn, draggingColumn],
  );

  return (
    <KanbanContext.Provider value={contextValue}>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={columnIds} strategy={horizontalListSortingStrategy}>
          <div className={cn("flex gap-3 overflow-x-auto", className)}>
            {columns.map((columnId) => (
              <KanbanColumn
                key={columnId}
                columnId={columnId}
                items={value[columnId] || []}
                renderHeader={renderColumnHeader}
                renderCard={renderCard}
                isDraggable={!!onColumnsChange}
              />
            ))}
          </div>
        </SortableContext>

        <DragOverlay>
          {activeItem ? (
            <div className="rounded-md border bg-card px-2 py-1.5 shadow-lg opacity-90">
              {renderCard(activeItem)}
            </div>
          ) : null}
          {draggingColumn ? (
            <div className="w-72 shrink-0 rounded-lg bg-muted/50 border-2 border-primary shadow-lg opacity-90">
              <div className="px-2 py-1.5 font-medium">
                {renderColumnHeader(draggingColumn, value[draggingColumn] || [])}
              </div>
              <div className="min-h-[60px] p-2 text-muted-foreground text-sm text-center">
                {(value[draggingColumn] || []).length} items
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </KanbanContext.Provider>
  );
}

// ============================================================================
// Column Component
// ============================================================================

interface KanbanColumnProps {
  columnId: string;
  items: KanbanItem[];
  renderHeader: (columnId: string, items: KanbanItem[]) => ReactNode;
  renderCard: (item: KanbanItem) => ReactNode;
  isDraggable?: boolean;
}

function KanbanColumn({
  columnId,
  items,
  renderHeader,
  renderCard,
  isDraggable,
}: KanbanColumnProps) {
  const itemIds = useMemo(() => items.map((item) => item.id), [items]);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `column:${columnId}`,
    disabled: !isDraggable,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const contextValue = useMemo<KanbanColumnContextValue>(() => ({ columnId }), [columnId]);

  return (
    <KanbanColumnContext.Provider value={contextValue}>
      <div
        ref={setNodeRef}
        style={style}
        className={cn(
          "flex w-72 shrink-0 flex-col rounded-lg bg-muted/50",
          isDragging && "opacity-50",
        )}
      >
        {/* Column Header - drag handle */}
        <div
          className={cn(
            "px-2 py-1.5 font-medium",
            isDraggable && "cursor-grab active:cursor-grabbing",
          )}
          {...(isDraggable ? { ...attributes, ...listeners } : {})}
        >
          {renderHeader(columnId, items)}
        </div>

        {/* Cards Container */}
        <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
          <div className="flex min-h-[60px] flex-col gap-1.5 px-1.5 pb-1.5">
            {items.map((item) => (
              <KanbanCard key={item.id} item={item} renderCard={renderCard} />
            ))}
          </div>
        </SortableContext>
      </div>
    </KanbanColumnContext.Provider>
  );
}

// ============================================================================
// Card Component
// ============================================================================

interface KanbanCardProps {
  item: KanbanItem;
  renderCard: (item: KanbanItem) => ReactNode;
}

function KanbanCard({ item, renderCard }: KanbanCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "rounded-md border bg-card px-2 py-1.5 shadow-sm cursor-grab active:cursor-grabbing",
        "hover:border-primary/50 transition-colors",
        isDragging && "opacity-50",
      )}
      {...attributes}
      {...listeners}
    >
      {renderCard(item)}
    </div>
  );
}

// ============================================================================
// Utility: Diff to find moved item
// ============================================================================

export interface MovedItem {
  item: KanbanItem;
  fromColumn: string;
  toColumn: string;
}

/**
 * Find which item moved between two board states.
 * Returns the moved item and its old/new columns, or null if no move detected.
 */
export function findMovedItem(
  oldValue: KanbanBoardValue,
  newValue: KanbanBoardValue,
): MovedItem | null {
  // Find item that changed columns
  for (const [newCol, newItems] of Object.entries(newValue)) {
    for (const item of newItems) {
      // Check if this item was in a different column before
      for (const [oldCol, oldItems] of Object.entries(oldValue)) {
        if (oldCol === newCol) continue;
        if (oldItems.some((oldItem) => oldItem.id === item.id)) {
          return { item, fromColumn: oldCol, toColumn: newCol };
        }
      }
    }
  }
  return null;
}

/**
 * Group flat array of items by a column field.
 */
export function groupByColumn<T extends Record<string, unknown>>(
  items: T[],
  columnField: string,
): Record<string, T[]> {
  const result: Record<string, T[]> = {};
  for (const item of items) {
    const columnValue = String(item[columnField] ?? "");
    if (!result[columnValue]) {
      result[columnValue] = [];
    }
    result[columnValue].push(item);
  }
  return result;
}

/**
 * Get unique column values from items, preserving first-seen order.
 */
export function getColumnOrder<T extends Record<string, unknown>>(
  items: T[],
  columnField: string,
): string[] {
  const seen = new Set<string>();
  const order: string[] = [];
  for (const item of items) {
    const value = String(item[columnField] ?? "");
    if (!seen.has(value)) {
      seen.add(value);
      order.push(value);
    }
  }
  return order;
}
