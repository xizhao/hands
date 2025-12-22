import type { Story } from "@ladle/react";
import { Button } from "./button";

export default {
  title: "Active/Button",
};

export const Default: Story = () => <Button>Click me</Button>;

export const Variants: Story = () => (
  <div className="flex flex-wrap gap-2">
    <Button variant="default">Default</Button>
    <Button variant="outline">Outline</Button>
    <Button variant="ghost">Ghost</Button>
    <Button variant="destructive">Destructive</Button>
  </div>
);

export const Loading: Story = () => (
  <div className="flex gap-2">
    <Button isLoading>Saving...</Button>
    <Button variant="outline" isLoading>
      Loading
    </Button>
  </div>
);

export const Disabled: Story = () => (
  <div className="flex gap-2">
    <Button disabled>Disabled</Button>
    <Button variant="outline" disabled>
      Disabled
    </Button>
  </div>
);
