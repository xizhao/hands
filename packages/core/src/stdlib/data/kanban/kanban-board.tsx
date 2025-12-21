"use client";

/**
 * Kanban Board - Core drag-and-drop board component
 *
 * A simplified, accessible Kanban board built with @dnd-kit.
 * Inspired by DiceUI's Kanban component.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "../../../lib/utils";

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
}

interface KanbanColumnContextValue {
  columnId: string;
}

// ============================================================================
// Contexts
// ============================================================================

const KanbanContext = createContext<KanbanContextValue | null>(null);
const KanbanColumnContext = createContext<KanbanColumnContextValue | null>(null);

function useKanbanContext() {
  const ctx = useContext(KanbanContext);
  if (!ctx) throw new Error("useKanbanContext must be used within KanbanBoard");
  return ctx;
}

function useKanbanColumnContext() {
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
  renderColumnHeader,
  renderCard,
  className,
}: KanbanBoardProps) {
  const [activeItem, setActiveItem] = useState<KanbanItem | null>(null);
  const [activeColumn, setActiveColumn] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
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
      const column = findItemColumn(active.id);
      if (column) {
        const item = value[column]?.find((i) => i.id === active.id);
        if (item) {
          setActiveItem(item);
          setActiveColumn(column);
        }
      }
    },
    [findItemColumn, value],
  );

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const { active, over } = event;
      if (!over) return;

      const activeId = active.id;
      const overId = over.id;

      const activeCol = findItemColumn(activeId);
      // Check if over is a column or an item
      const overCol = columns.includes(String(overId))
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
    [columns, findItemColumn, onValueChange, value],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;

      setActiveItem(null);
      setActiveColumn(null);

      if (!over) return;

      const activeId = active.id;
      const overId = over.id;

      const activeCol = findItemColumn(activeId);
      const overCol = columns.includes(String(overId))
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
    [columns, findItemColumn, onValueChange, value],
  );

  const contextValue = useMemo<KanbanContextValue>(
    () => ({ activeItem, activeColumn }),
    [activeItem, activeColumn],
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
        <div className={cn("flex gap-4 overflow-x-auto p-4", className)}>
          {columns.map((columnId) => (
            <KanbanColumn
              key={columnId}
              columnId={columnId}
              items={value[columnId] || []}
              renderHeader={renderColumnHeader}
              renderCard={renderCard}
            />
          ))}
        </div>

        <DragOverlay>
          {activeItem ? (
            <div className="rounded-lg border bg-card p-3 shadow-lg opacity-90">
              {renderCard(activeItem)}
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
}

function KanbanColumn({ columnId, items, renderHeader, renderCard }: KanbanColumnProps) {
  const itemIds = useMemo(() => items.map((item) => item.id), [items]);

  const contextValue = useMemo<KanbanColumnContextValue>(
    () => ({ columnId }),
    [columnId],
  );

  return (
    <KanbanColumnContext.Provider value={contextValue}>
      <div className="flex w-72 shrink-0 flex-col rounded-lg bg-muted/50">
        {/* Column Header */}
        <div className="p-3 font-medium">{renderHeader(columnId, items)}</div>

        {/* Cards Container */}
        <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
          <div className="flex min-h-[100px] flex-col gap-2 p-2">
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
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "rounded-lg border bg-card p-3 shadow-sm cursor-grab active:cursor-grabbing",
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
