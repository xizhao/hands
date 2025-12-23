/**
 * Kanban Component Tests
 */

import { describe, expect, it } from "vitest";
import {
  findMovedItem,
  getColumnOrder,
  groupByColumn,
  type KanbanBoardValue,
  type KanbanItem,
} from "./kanban-board";
import { createKanbanElement } from "./kanban";

// ============================================================================
// groupByColumn Tests
// ============================================================================

describe("groupByColumn", () => {
  it("groups items by a string column", () => {
    const items = [
      { id: 1, title: "Task A", status: "todo" },
      { id: 2, title: "Task B", status: "done" },
      { id: 3, title: "Task C", status: "todo" },
    ];

    const result = groupByColumn(items, "status");

    expect(result).toEqual({
      todo: [
        { id: 1, title: "Task A", status: "todo" },
        { id: 3, title: "Task C", status: "todo" },
      ],
      done: [{ id: 2, title: "Task B", status: "done" }],
    });
  });

  it("handles empty array", () => {
    const result = groupByColumn([], "status");
    expect(result).toEqual({});
  });

  it("handles items with missing column value", () => {
    const items = [
      { id: 1, title: "Task A" },
      { id: 2, title: "Task B", status: "done" },
    ];

    const result = groupByColumn(items, "status");

    expect(result).toEqual({
      "": [{ id: 1, title: "Task A" }],
      done: [{ id: 2, title: "Task B", status: "done" }],
    });
  });

  it("handles null and undefined column values", () => {
    const items = [
      { id: 1, title: "Task A", status: null },
      { id: 2, title: "Task B", status: undefined },
      { id: 3, title: "Task C", status: "done" },
    ];

    const result = groupByColumn(items, "status");

    expect(result).toEqual({
      "": [
        { id: 1, title: "Task A", status: null },
        { id: 2, title: "Task B", status: undefined },
      ],
      done: [{ id: 3, title: "Task C", status: "done" }],
    });
  });

  it("converts non-string values to strings", () => {
    const items = [
      { id: 1, title: "Task A", priority: 1 },
      { id: 2, title: "Task B", priority: 2 },
      { id: 3, title: "Task C", priority: 1 },
    ];

    const result = groupByColumn(items, "priority");

    expect(result).toEqual({
      "1": [
        { id: 1, title: "Task A", priority: 1 },
        { id: 3, title: "Task C", priority: 1 },
      ],
      "2": [{ id: 2, title: "Task B", priority: 2 }],
    });
  });
});

// ============================================================================
// getColumnOrder Tests
// ============================================================================

describe("getColumnOrder", () => {
  it("returns columns in first-seen order", () => {
    const items = [
      { id: 1, status: "todo" },
      { id: 2, status: "in_progress" },
      { id: 3, status: "todo" },
      { id: 4, status: "done" },
    ];

    const order = getColumnOrder(items, "status");

    expect(order).toEqual(["todo", "in_progress", "done"]);
  });

  it("handles empty array", () => {
    const order = getColumnOrder([], "status");
    expect(order).toEqual([]);
  });

  it("handles single column", () => {
    const items = [
      { id: 1, status: "todo" },
      { id: 2, status: "todo" },
    ];

    const order = getColumnOrder(items, "status");

    expect(order).toEqual(["todo"]);
  });

  it("handles missing column values", () => {
    const items = [
      { id: 1 },
      { id: 2, status: "done" },
    ];

    const order = getColumnOrder(items, "status");

    expect(order).toEqual(["", "done"]);
  });
});

// ============================================================================
// findMovedItem Tests
// ============================================================================

describe("findMovedItem", () => {
  it("detects item moved to different column", () => {
    const oldValue: KanbanBoardValue = {
      todo: [
        { id: 1, title: "Task A" },
        { id: 2, title: "Task B" },
      ],
      done: [],
    };

    const newValue: KanbanBoardValue = {
      todo: [{ id: 1, title: "Task A" }],
      done: [{ id: 2, title: "Task B" }],
    };

    const moved = findMovedItem(oldValue, newValue);

    expect(moved).toEqual({
      item: { id: 2, title: "Task B" },
      fromColumn: "todo",
      toColumn: "done",
    });
  });

  it("returns null when no item moved between columns", () => {
    const oldValue: KanbanBoardValue = {
      todo: [
        { id: 1, title: "Task A" },
        { id: 2, title: "Task B" },
      ],
    };

    // Reordered within same column
    const newValue: KanbanBoardValue = {
      todo: [
        { id: 2, title: "Task B" },
        { id: 1, title: "Task A" },
      ],
    };

    const moved = findMovedItem(oldValue, newValue);

    expect(moved).toBeNull();
  });

  it("returns null for empty boards", () => {
    const oldValue: KanbanBoardValue = {};
    const newValue: KanbanBoardValue = {};

    const moved = findMovedItem(oldValue, newValue);

    expect(moved).toBeNull();
  });

  it("detects move to new column", () => {
    const oldValue: KanbanBoardValue = {
      todo: [{ id: 1, title: "Task A" }],
    };

    const newValue: KanbanBoardValue = {
      todo: [],
      in_progress: [{ id: 1, title: "Task A" }],
    };

    const moved = findMovedItem(oldValue, newValue);

    expect(moved).toEqual({
      item: { id: 1, title: "Task A" },
      fromColumn: "todo",
      toColumn: "in_progress",
    });
  });

  it("handles numeric ids", () => {
    const oldValue: KanbanBoardValue = {
      todo: [{ id: 123, title: "Task" }],
      done: [],
    };

    const newValue: KanbanBoardValue = {
      todo: [],
      done: [{ id: 123, title: "Task" }],
    };

    const moved = findMovedItem(oldValue, newValue);

    expect(moved).toEqual({
      item: { id: 123, title: "Task" },
      fromColumn: "todo",
      toColumn: "done",
    });
  });

  it("handles string ids", () => {
    const oldValue: KanbanBoardValue = {
      todo: [{ id: "abc-123", title: "Task" }],
      done: [],
    };

    const newValue: KanbanBoardValue = {
      todo: [],
      done: [{ id: "abc-123", title: "Task" }],
    };

    const moved = findMovedItem(oldValue, newValue);

    expect(moved).toEqual({
      item: { id: "abc-123", title: "Task" },
      fromColumn: "todo",
      toColumn: "done",
    });
  });
});

// ============================================================================
// createKanbanElement Tests
// ============================================================================

describe("createKanbanElement", () => {
  it("creates element with required fields only", () => {
    const element = createKanbanElement("status", "title");

    expect(element).toEqual({
      type: "kanban",
      groupByColumn: "status",
      cardTitleField: "title",
      updateSql: undefined, // Auto-generated at runtime from parent LiveValue
      columnOrder: undefined,
      cardFields: undefined,
      idField: undefined,
      children: [{ text: "" }],
    });
  });

  it("creates element with explicit updateSql", () => {
    const element = createKanbanElement("status", "title", {
      updateSql: "UPDATE tasks SET status = {{status}} WHERE id = {{id}}",
    });

    expect(element.updateSql).toBe(
      "UPDATE tasks SET status = {{status}} WHERE id = {{id}}"
    );
  });

  it("creates element with all optional fields", () => {
    const element = createKanbanElement("status", "title", {
      columnOrder: ["todo", "in_progress", "done"],
      cardFields: ["priority", "assignee"],
      idField: "task_id",
      updateSql: "UPDATE tasks SET status = {{status}} WHERE id = {{id}}",
    });

    expect(element.columnOrder).toEqual(["todo", "in_progress", "done"]);
    expect(element.cardFields).toEqual(["priority", "assignee"]);
    expect(element.idField).toBe("task_id");
    expect(element.updateSql).toBe(
      "UPDATE tasks SET status = {{status}} WHERE id = {{id}}"
    );
  });

  it("creates valid kanban element type", () => {
    const element = createKanbanElement("status", "title");

    expect(element.type).toBe("kanban");
  });
});
