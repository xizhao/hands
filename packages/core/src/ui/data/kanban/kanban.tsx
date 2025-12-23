"use client";

/**
 * @component Kanban
 * @category data
 * @description Drag-and-drop Kanban board that displays data grouped by a column. Cards can be dragged between columns to update the underlying data. Must be wrapped in a LiveValue to receive data. REQUIRED: groupByColumn (column to group by), cardTitleField (field for card title). OPTIONAL: fixedColumns (always show these columns in order, filter data to match), columnOrder (explicit column order + extras from data), cardFields (additional fields on cards), idField (primary key, default 'id'), updateSql (auto-generated from parent query if not provided).
 * @keywords kanban, board, drag, drop, cards, columns, status, workflow, tasks, fixed
 * @example
 * <LiveValue query="SELECT id, title, status FROM tasks">
 *   <Kanban groupByColumn="status" cardTitleField="title" fixedColumns={["todo", "in_progress", "done"]} />
 * </LiveValue>
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

import { KANBAN_KEY, type TKanbanElement, type ComponentMeta } from "../../../types";
import { substituteFormBindings } from "../../action/live-action";
import { useLiveValueData } from "../../view/charts/context";
import { useLiveMutation } from "../../query-provider";
import {
  KanbanBoard,
  findMovedItem,
  groupByColumn,
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
  /** Explicit column order (includes extras from data) */
  columnOrder?: string[];
  /**
   * Fixed columns to always display in this exact order.
   * Items not matching any fixed column are filtered out.
   * Takes precedence over columnOrder if both provided.
   */
  fixedColumns?: string[];
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
  fixedColumns,
  cardTitleField,
  cardFields = [],
  idField = "id",
  onMove,
  onColumnsChange,
  className,
}: KanbanProps) {
  // Track previous value for diffing
  const prevValueRef = useRef<KanbanBoardValue>({});

  // Group data by column, optionally filtering to fixed columns
  const groupedData = useMemo(() => {
    if (!data || data.length === 0) {
      // If fixed columns, return empty arrays for each
      if (fixedColumns && fixedColumns.length > 0) {
        return Object.fromEntries(fixedColumns.map((col) => [col, []]));
      }
      return {};
    }

    // Ensure each item has an id
    let itemsWithId = data.map((item, index) => ({
      ...item,
      id: item[idField] ?? index,
    })) as KanbanItem[];

    // If fixed columns, filter to only items matching those columns
    if (fixedColumns && fixedColumns.length > 0) {
      const fixedSet = new Set(fixedColumns);
      itemsWithId = itemsWithId.filter((item) =>
        fixedSet.has(String(item[groupByColumnField] ?? "")),
      );
    }

    const grouped = groupByColumn(itemsWithId, groupByColumnField);

    // If fixed columns, ensure all columns exist (even if empty)
    if (fixedColumns && fixedColumns.length > 0) {
      for (const col of fixedColumns) {
        if (!grouped[col]) {
          grouped[col] = [];
        }
      }
    }

    return grouped;
  }, [data, groupByColumnField, idField, fixedColumns]);

  // Determine column order
  const columns = useMemo(() => {
    // Fixed columns take precedence - exact order, no extras
    if (fixedColumns && fixedColumns.length > 0) {
      return fixedColumns;
    }

    // Otherwise use columnOrder + extras from data
    if (explicitColumnOrder && explicitColumnOrder.length > 0) {
      const dataColumns = Object.keys(groupedData);
      const extraColumns = dataColumns.filter(
        (col) => !explicitColumnOrder.includes(col),
      );
      return [...explicitColumnOrder, ...extraColumns];
    }

    return Object.keys(groupedData);
  }, [fixedColumns, explicitColumnOrder, groupedData]);

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
    groupByColumn: groupByColumnField,
    columnOrder,
    fixedColumns,
    cardTitleField,
    cardFields,
    updateSql: explicitUpdateSql,
    idField = "id",
  } = element;

  // Get data from parent LiveValue context
  const liveValueCtx = useLiveValueData();
  const data = liveValueCtx?.data ?? [];
  const isLoading = liveValueCtx?.isLoading ?? false;
  const error = liveValueCtx?.error ?? null;
  const tableName = liveValueCtx?.tableName;

  // Auto-generate updateSql if not provided
  const updateSql = useMemo(() => {
    if (explicitUpdateSql) return explicitUpdateSql;
    if (!tableName) return null;
    // Generate: UPDATE tableName SET groupByColumn = {{groupByColumn}} WHERE idField = {{idField}}
    return `UPDATE ${tableName} SET ${groupByColumnField} = {{${groupByColumnField}}} WHERE ${idField} = {{${idField}}}`;
  }, [explicitUpdateSql, tableName, groupByColumnField, idField]);

  // Get mutation function from LiveQuery provider
  const { mutate } = useLiveMutation();

  const handleMove = useCallback(
    async (itemId: string | number, newColumn: string) => {
      if (!updateSql) {
        console.warn("[Kanban] No updateSql configured and could not auto-generate (missing table name)");
        return;
      }

      const sql = substituteFormBindings(updateSql, {
        [idField]: itemId,
        [groupByColumnField]: newColumn,
      });

      await mutate(sql);
    },
    [updateSql, idField, groupByColumnField, mutate],
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

  // Show warning if not inside LiveValue
  if (!liveValueCtx) {
    return (
      <PlateElement
        {...props}
        className={cn(
          "my-4",
          selected && "ring-1 ring-primary/30 ring-offset-2 rounded-lg",
        )}
      >
        <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-4 text-amber-700 text-sm">
          Kanban must be wrapped in a LiveValue component to receive data.
        </div>
        <span className="hidden">{props.children}</span>
      </PlateElement>
    );
  }

  return (
    <PlateElement
      {...props}
      className={cn(
        "my-4",
        selected && "ring-1 ring-primary/30 ring-offset-2 rounded-lg",
      )}
    >
      <Kanban
        data={data}
        isLoading={isLoading}
        error={error}
        groupByColumn={groupByColumnField}
        columnOrder={columnOrder}
        fixedColumns={fixedColumns}
        cardTitleField={cardTitleField}
        cardFields={cardFields}
        idField={idField}
        onMove={handleMove}
        onColumnsChange={fixedColumns ? undefined : handleColumnsChange}
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
 * Must be used inside a LiveValue element.
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
  /** Explicit column order (includes extras from data) */
  columnOrder?: string[];
  /**
   * Fixed columns to always display in this exact order.
   * Items not matching any fixed column are filtered out.
   * Takes precedence over columnOrder if both provided.
   */
  fixedColumns?: string[];
  /** Additional fields to show on cards */
  cardFields?: string[];
  /** Primary key field (default "id") */
  idField?: string;
  /** Custom SQL update template. Auto-generated from parent LiveValue's table if not provided. */
  updateSql?: string;
}

/**
 * Create a Kanban element for insertion into editor.
 * Must be placed inside a LiveValue element.
 *
 * The updateSql is auto-generated from the parent LiveValue's table name if not provided.
 *
 * @example
 * // Minimal - updateSql auto-generated
 * createKanbanElement("status", "title")
 *
 * // With fixed columns (always show these, filter to these values)
 * createKanbanElement("status", "title", { fixedColumns: ["todo", "in_progress", "done"] })
 *
 * // With custom updateSql
 * createKanbanElement("status", "title", { updateSql: "UPDATE tasks SET status = {{status}} WHERE id = {{id}}" })
 */
export function createKanbanElement(
  groupByColumn: string,
  cardTitleField: string,
  options?: CreateKanbanElementOptions,
): TKanbanElement {
  return {
    type: KANBAN_KEY,
    groupByColumn,
    cardTitleField,
    updateSql: options?.updateSql,
    columnOrder: options?.columnOrder,
    fixedColumns: options?.fixedColumns,
    cardFields: options?.cardFields,
    idField: options?.idField,
    children: [{ text: "" }],
  };
}

export { KANBAN_KEY };

// ============================================================================
// Component Metadata (for validation/linting)
// ============================================================================

export const KanbanMeta: ComponentMeta = {
  category: "data",
  requiredProps: ["groupByColumn", "cardTitleField"],
  constraints: {
    requireParent: ["LiveValue"],
  },
};
