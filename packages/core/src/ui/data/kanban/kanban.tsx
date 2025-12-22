"use client";

/**
 * @component Kanban
 * @category data
 * @description Drag-and-drop Kanban board that displays SQL query results grouped by a column.
 * Cards can be dragged between columns to update the underlying data.
 * @keywords kanban, board, drag, drop, cards, columns, status, workflow, tasks
 * @example
 * <Kanban
 *   query="SELECT id, title, status FROM tasks"
 *   groupByColumn="status"
 *   cardTitleField="title"
 *   updateSql="UPDATE tasks SET status = {{status}} WHERE id = {{id}}"
 * />
 */

import { memo, useCallback, useMemo, useRef, useState } from "react";
import {
  createPlatePlugin,
  PlateElement,
  type PlateElementProps,
  useEditorRef,
  useElement,
  useSelected,
} from "platejs/react";

import { KANBAN_KEY, type TKanbanElement } from "../../../types";
import { assertReadOnlySQL } from "../../../primitives/sql-validation";
import { substituteFormBindings } from "../../action/live-action";
import {
  KanbanBoard,
  findMovedItem,
  groupByColumn,
  getColumnOrder,
  type KanbanBoardValue,
  type KanbanItem,
} from "./kanban-board";
import { cn } from "../../lib/utils";

// ============================================================================
// Standalone Component
// ============================================================================

export interface KanbanProps {
  /** Data rows to display */
  data: Record<string, unknown>[];
  /** Loading state */
  isLoading?: boolean;
  /** Error state */
  error?: Error | null;
  /** Column field to group cards by */
  groupByColumn: string;
  /** Explicit column order */
  columnOrder?: string[];
  /** Field to use as card title */
  cardTitleField: string;
  /** Additional fields to show on cards */
  cardFields?: string[];
  /** Primary key field (default "id") */
  idField?: string;
  /** Called when a card is moved to a new column */
  onMove?: (itemId: string | number, newColumn: string) => Promise<void>;
  /** Called when columns are reordered */
  onColumnsChange?: (columns: string[]) => void;
  /** Additional class name */
  className?: string;
}

/**
 * Standalone Kanban component for use outside Plate editor.
 */
export function Kanban({
  data,
  isLoading,
  error,
  groupByColumn: groupByColumnField,
  columnOrder: explicitColumnOrder,
  cardTitleField,
  cardFields = [],
  idField = "id",
  onMove,
  onColumnsChange,
  className,
}: KanbanProps) {
  // Track previous value for diffing
  const prevValueRef = useRef<KanbanBoardValue>({});

  // Group data by column
  const groupedData = useMemo(() => {
    if (!data || data.length === 0) return {};
    // Ensure each item has an id
    const itemsWithId = data.map((item, index) => ({
      ...item,
      id: item[idField] ?? index,
    })) as KanbanItem[];
    return groupByColumn(itemsWithId, groupByColumnField);
  }, [data, groupByColumnField, idField]);

  // Determine column order
  const columns = useMemo(() => {
    if (explicitColumnOrder && explicitColumnOrder.length > 0) {
      // Include explicit columns + any additional from data
      const dataColumns = Object.keys(groupedData);
      const extraColumns = dataColumns.filter(
        (col) => !explicitColumnOrder.includes(col),
      );
      return [...explicitColumnOrder, ...extraColumns];
    }
    return Object.keys(groupedData);
  }, [explicitColumnOrder, groupedData]);

  // Local board state (for optimistic updates)
  const [boardValue, setBoardValue] = useState<KanbanBoardValue>(groupedData);

  // Sync with data changes
  useMemo(() => {
    setBoardValue(groupedData);
    prevValueRef.current = groupedData;
  }, [groupedData]);

  const handleValueChange = useCallback(
    async (newValue: KanbanBoardValue) => {
      const moved = findMovedItem(prevValueRef.current, newValue);

      // Optimistic update
      setBoardValue(newValue);
      prevValueRef.current = newValue;

      // If a card moved columns, trigger the onMove callback
      if (moved && onMove) {
        try {
          await onMove(moved.item.id, moved.toColumn);
        } catch (err) {
          // Revert on error
          console.error("[Kanban] Move failed:", err);
          setBoardValue(groupedData);
          prevValueRef.current = groupedData;
        }
      }
    },
    [groupedData, onMove],
  );

  const renderColumnHeader = useCallback(
    (columnId: string, items: KanbanItem[]) => (
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold capitalize">
          {columnId.replace(/_/g, " ")}
        </span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          {items.length}
        </span>
      </div>
    ),
    [],
  );

  const renderCard = useCallback(
    (item: KanbanItem) => (
      <div className="space-y-1">
        <div className="font-medium text-sm">
          {String(item[cardTitleField] ?? "")}
        </div>
        {cardFields.map((field) => (
          <div key={field} className="text-xs text-muted-foreground">
            <span className="capitalize">{field.replace(/_/g, " ")}:</span>{" "}
            {String(item[field] ?? "")}
          </div>
        ))}
      </div>
    ),
    [cardTitleField, cardFields],
  );

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive text-sm">
        Error loading Kanban data
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex gap-4 p-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="w-72 shrink-0 rounded-lg bg-muted/50 p-4 animate-pulse"
          >
            <div className="h-4 w-20 rounded bg-muted mb-4" />
            <div className="space-y-2">
              <div className="h-16 rounded bg-muted" />
              <div className="h-16 rounded bg-muted" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
        No items to display
      </div>
    );
  }

  return (
    <KanbanBoard
      value={boardValue}
      onValueChange={handleValueChange}
      columns={columns}
      onColumnsChange={onColumnsChange}
      renderColumnHeader={renderColumnHeader}
      renderCard={renderCard}
      className={className}
    />
  );
}

// ============================================================================
// Plate Element
// ============================================================================

function KanbanElement(props: PlateElementProps) {
  const editor = useEditorRef();
  const element = useElement<TKanbanElement>();
  const selected = useSelected();

  const {
    query: _query,
    groupByColumn: groupByColumnField,
    columnOrder,
    cardTitleField,
    cardFields,
    updateSql,
    idField = "id",
  } = element;

  // TODO: Use context provider for data fetching (will use _query)
  // For now, show placeholder in editor
  const data: Record<string, unknown>[] = [];
  const isLoading = false;
  const error = null;

  // TODO: Get onExecute from context provider
  const handleMove = useCallback(
    async (itemId: string | number, newColumn: string) => {
      if (!updateSql) {
        console.warn("[Kanban] No updateSql configured");
        return;
      }

      const sql = substituteFormBindings(updateSql, {
        [idField]: itemId,
        [groupByColumnField]: newColumn,
      });

      // TODO: Execute via context provider
      console.log("[Kanban] Would execute:", sql);
    },
    [updateSql, idField, groupByColumnField],
  );

  // Handle column reordering - update the element's columnOrder
  const handleColumnsChange = useCallback(
    (newColumns: string[]) => {
      const path = editor.api.findPath(element);
      if (path) {
        editor.tf.setNodes(
          { columnOrder: newColumns },
          { at: path },
        );
      }
    },
    [editor, element],
  );

  return (
    <PlateElement
      {...props}
      className={cn(
        "my-4",
        selected && "ring-2 ring-ring ring-offset-2 rounded-lg",
      )}
    >
      <Kanban
        data={data}
        isLoading={isLoading}
        error={error}
        groupByColumn={groupByColumnField}
        columnOrder={columnOrder}
        cardTitleField={cardTitleField}
        cardFields={cardFields}
        idField={idField}
        onMove={handleMove}
        onColumnsChange={handleColumnsChange}
      />
      {/* Hidden children for Plate */}
      <span className="hidden">{props.children}</span>
    </PlateElement>
  );
}

// ============================================================================
// Plugin
// ============================================================================

/**
 * Kanban Plugin - drag-and-drop board for grouped data with mutations.
 */
export const KanbanPlugin = createPlatePlugin({
  key: KANBAN_KEY,
  node: {
    isElement: true,
    isVoid: true,
    component: memo(KanbanElement),
  },
});

// ============================================================================
// Element Factory
// ============================================================================

export interface CreateKanbanElementOptions {
  /** Explicit column order */
  columnOrder?: string[];
  /** Additional fields to show on cards */
  cardFields?: string[];
  /** Primary key field (default "id") */
  idField?: string;
}

/**
 * Create a Kanban element for insertion into editor.
 * Validates that query is read-only.
 */
export function createKanbanElement(
  query: string,
  groupByColumn: string,
  cardTitleField: string,
  updateSql: string,
  options?: CreateKanbanElementOptions,
): TKanbanElement {
  // Validate query is read-only
  assertReadOnlySQL(query);

  return {
    type: KANBAN_KEY,
    query,
    groupByColumn,
    cardTitleField,
    updateSql,
    columnOrder: options?.columnOrder,
    cardFields: options?.cardFields,
    idField: options?.idField,
    children: [{ text: "" }],
  };
}

export { KANBAN_KEY };
