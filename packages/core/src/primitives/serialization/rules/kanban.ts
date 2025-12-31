/**
 * Kanban Serialization Rules
 *
 * Handles MDX ↔ Plate conversion for kanban board elements.
 */

import { KANBAN_KEY, type TKanbanElement } from "../../../types";
import { createVoidElement, parseAttributes, serializeAttributes } from "../helpers";
import type { MdxSerializationRule } from "../types";

// ============================================================================
// Kanban
// ============================================================================

/**
 * Kanban serialization rule.
 *
 * MDX Example:
 * ```mdx
 * <Kanban
 *   query="SELECT id, title, status FROM tasks"
 *   groupByColumn="status"
 *   cardTitleField="title"
 *   updateSql="UPDATE tasks SET status = {{status}} WHERE id = {{id}}"
 * />
 * <Kanban
 *   query="SELECT * FROM tickets"
 *   groupByColumn="stage"
 *   fixedColumns={["backlog", "todo", "in_progress", "done"]}
 *   cardTitleField="title"
 *   cardFields={["assignee", "priority"]}
 *   updateSql="UPDATE tickets SET stage = {{stage}} WHERE ticket_id = {{ticket_id}}"
 *   idField="ticket_id"
 * />
 * ```
 */
export const kanbanRule: MdxSerializationRule<TKanbanElement> = {
  tagName: "Kanban",
  key: KANBAN_KEY,

  deserialize: (node) => {
    const props = parseAttributes(node);

    return createVoidElement<TKanbanElement>(KANBAN_KEY, {
      query: props.query as string,
      groupByColumn: props.groupByColumn as string,
      columnOrder: props.columnOrder as string[] | undefined,
      fixedColumns: props.fixedColumns as string[] | undefined,
      cardTitleField: props.cardTitleField as string,
      cardFields: props.cardFields as string[] | undefined,
      updateSql: props.updateSql as string,
      idField: props.idField as string | undefined,
    });
  },

  serialize: (element) => {
    const attrs = serializeAttributes(
      {
        query: element.query,
        groupByColumn: element.groupByColumn,
        columnOrder: element.columnOrder,
        fixedColumns: element.fixedColumns,
        cardTitleField: element.cardTitleField,
        cardFields: element.cardFields,
        updateSql: element.updateSql,
        idField: element.idField,
      },
      {
        include: [
          "query",
          "groupByColumn",
          "columnOrder",
          "fixedColumns",
          "cardTitleField",
          "cardFields",
          "updateSql",
          "idField",
        ],
        defaults: {
          idField: "id",
        },
      },
    );

    return {
      type: "mdxJsxFlowElement",
      name: "Kanban",
      attributes: attrs,
      children: [],
    };
  },
};

// ============================================================================
// Export all rules
// ============================================================================

export const kanbanRules = [kanbanRule];
