import type { Story } from "@ladle/react";
import { Kanban } from "./kanban";

export default {
  title: "Data/Kanban",
};

const sampleTasks = [
  { id: 1, title: "Design mockups", status: "todo", priority: "high" },
  { id: 2, title: "Write tests", status: "in_progress", priority: "medium" },
  { id: 3, title: "Review PR", status: "in_progress", priority: "high" },
  { id: 4, title: "Deploy to staging", status: "todo", priority: "low" },
  { id: 5, title: "Fix bug #123", status: "done", priority: "high" },
  { id: 6, title: "Update docs", status: "done", priority: "low" },
  { id: 7, title: "Refactor auth", status: "todo", priority: "medium" },
];

export const Default: Story = () => (
  <Kanban
    data={sampleTasks}
    groupByColumn="status"
    cardTitleField="title"
    cardFields={["priority"]}
  />
);

export const CustomColumnOrder: Story = () => (
  <Kanban
    data={sampleTasks}
    groupByColumn="status"
    columnOrder={["todo", "in_progress", "done"]}
    cardTitleField="title"
    cardFields={["priority"]}
  />
);

export const Loading: Story = () => (
  <Kanban
    data={[]}
    isLoading={true}
    groupByColumn="status"
    cardTitleField="title"
  />
);

const errorInstance = new Error("Failed to load tasks");

export const ErrorState: Story = () => (
  <Kanban
    data={[]}
    error={errorInstance}
    groupByColumn="status"
    cardTitleField="title"
  />
);

export const Empty: Story = () => (
  <Kanban
    data={[]}
    groupByColumn="status"
    cardTitleField="title"
  />
);

const manyTasks = Array.from({ length: 30 }, (_, i) => ({
  id: i + 1,
  title: `Task ${i + 1}`,
  status: ["backlog", "todo", "in_progress", "review", "done"][i % 5],
  assignee: ["Alice", "Bob", "Charlie", "Diana"][i % 4],
  priority: ["low", "medium", "high"][i % 3],
}));

export const LargeDataset: Story = () => (
  <Kanban
    data={manyTasks}
    groupByColumn="status"
    columnOrder={["backlog", "todo", "in_progress", "review", "done"]}
    cardTitleField="title"
    cardFields={["assignee", "priority"]}
  />
);

export const WithMoveHandler: Story = () => (
  <Kanban
    data={sampleTasks}
    groupByColumn="status"
    columnOrder={["todo", "in_progress", "done"]}
    cardTitleField="title"
    cardFields={["priority"]}
    onMove={async (itemId, newColumn) => {
      console.log(`Moving task ${itemId} to ${newColumn}`);
      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 500));
    }}
  />
);

// Data that includes some "unknown" statuses not in our fixed columns
const tasksWithVariedStatuses = [
  { id: 1, title: "Design mockups", status: "todo", priority: "high" },
  { id: 2, title: "Write tests", status: "in_progress", priority: "medium" },
  { id: 3, title: "Archived task", status: "archived", priority: "low" }, // Will be filtered out
  { id: 4, title: "Deploy to staging", status: "done", priority: "low" },
  { id: 5, title: "Draft task", status: "draft", priority: "medium" }, // Will be filtered out
];

export const FixedColumns: Story = () => (
  <Kanban
    data={tasksWithVariedStatuses}
    groupByColumn="status"
    fixedColumns={["todo", "in_progress", "done"]}
    cardTitleField="title"
    cardFields={["priority"]}
  />
);
FixedColumns.meta = {
  description:
    "Fixed columns always show in order. Items with status='archived' or 'draft' are filtered out.",
};

export const FixedColumnsEmpty: Story = () => (
  <Kanban
    data={[]}
    groupByColumn="status"
    fixedColumns={["backlog", "todo", "in_progress", "review", "done"]}
    cardTitleField="title"
  />
);
FixedColumnsEmpty.meta = {
  description: "Fixed columns show even when there's no data.",
};
