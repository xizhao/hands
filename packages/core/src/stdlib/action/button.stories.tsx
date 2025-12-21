import type { Story } from "@ladle/react";
import { ActionButton } from "./button";

export default {
  title: "Active/Button",
};

export const Default: Story = () => <ActionButton>Click me</ActionButton>;

export const Variants: Story = () => (
  <div className="flex flex-wrap gap-2">
    <ActionButton variant="default">Default</ActionButton>
    <ActionButton variant="outline">Outline</ActionButton>
    <ActionButton variant="ghost">Ghost</ActionButton>
    <ActionButton variant="destructive">Destructive</ActionButton>
  </div>
);

export const Loading: Story = () => (
  <div className="flex gap-2">
    <ActionButton isLoading>Saving...</ActionButton>
    <ActionButton variant="outline" isLoading>
      Loading
    </ActionButton>
  </div>
);

export const Disabled: Story = () => (
  <div className="flex gap-2">
    <ActionButton disabled>Disabled</ActionButton>
    <ActionButton variant="outline" disabled>
      Disabled
    </ActionButton>
  </div>
);
