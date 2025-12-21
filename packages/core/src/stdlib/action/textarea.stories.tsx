import type { Story } from "@ladle/react";
import { ActionTextarea } from "./textarea";

export default {
  title: "Active/Textarea",
};

export const Default: Story = () => (
  <ActionTextarea name="content" placeholder="Enter your message..." />
);

export const WithLabel: Story = () => (
  <ActionTextarea
    name="description"
    label="Description"
    placeholder="Enter a detailed description..."
  />
);

export const CustomRows: Story = () => (
  <div className="flex flex-col gap-4 max-w-md">
    <ActionTextarea name="short" label="3 rows (default)" rows={3} />
    <ActionTextarea name="medium" label="5 rows" rows={5} />
    <ActionTextarea name="tall" label="8 rows" rows={8} />
  </div>
);

export const Required: Story = () => (
  <ActionTextarea name="notes" label="Notes" placeholder="Add notes..." required />
);

export const Disabled: Story = () => (
  <ActionTextarea name="disabled" label="Disabled" placeholder="Cannot edit" disabled />
);

export const WithDefaultValue: Story = () => (
  <ActionTextarea
    name="prefilled"
    label="Pre-filled Content"
    defaultValue="This textarea has some default content that was pre-filled."
    rows={4}
  />
);
