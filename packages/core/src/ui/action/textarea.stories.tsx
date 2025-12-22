import type { Story } from "@ladle/react";
import { Textarea } from "./textarea";

export default {
  title: "Active/Textarea",
};

export const Default: Story = () => (
  <Textarea name="content" placeholder="Enter your message..." />
);

export const WithLabel: Story = () => (
  <Textarea
    name="description"
    label="Description"
    placeholder="Enter a detailed description..."
  />
);

export const CustomRows: Story = () => (
  <div className="flex flex-col gap-4 max-w-md">
    <Textarea name="short" label="3 rows (default)" rows={3} />
    <Textarea name="medium" label="5 rows" rows={5} />
    <Textarea name="tall" label="8 rows" rows={8} />
  </div>
);

export const Required: Story = () => (
  <Textarea name="notes" label="Notes" placeholder="Add notes..." required />
);

export const Disabled: Story = () => (
  <Textarea name="disabled" label="Disabled" placeholder="Cannot edit" disabled />
);

export const WithDefaultValue: Story = () => (
  <Textarea
    name="prefilled"
    label="Pre-filled Content"
    defaultValue="This textarea has some default content that was pre-filled."
    rows={4}
  />
);
