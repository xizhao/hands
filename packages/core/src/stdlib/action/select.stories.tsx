import type { Story } from "@ladle/react";
import { ActionSelect } from "./select";

export default {
  title: "Active/Select",
};

const statusOptions = [
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In Progress" },
  { value: "done", label: "Done" },
];

export const Default: Story = () => <ActionSelect name="status" options={statusOptions} />;

export const WithLabel: Story = () => (
  <ActionSelect
    name="status"
    label="Status"
    options={statusOptions}
    placeholder="Choose status..."
  />
);

export const Required: Story = () => (
  <ActionSelect
    name="priority"
    label="Priority"
    options={[
      { value: "low", label: "Low" },
      { value: "medium", label: "Medium" },
      { value: "high", label: "High" },
    ]}
    required
  />
);

export const WithDefaultValue: Story = () => (
  <ActionSelect name="status" label="Status" options={statusOptions} defaultValue="in_progress" />
);

export const Disabled: Story = () => (
  <ActionSelect name="disabled" label="Disabled Select" options={statusOptions} disabled />
);
