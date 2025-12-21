import type { Story } from "@ladle/react";
import { Badge } from "./badge";

export default {
  title: "Static/Badge",
};

export const Default: Story = () => <Badge>Badge</Badge>;

export const Variants: Story = () => (
  <div className="flex flex-wrap gap-2">
    <Badge variant="default">Default</Badge>
    <Badge variant="secondary">Secondary</Badge>
    <Badge variant="success">Success</Badge>
    <Badge variant="warning">Warning</Badge>
    <Badge variant="destructive">Destructive</Badge>
    <Badge variant="outline">Outline</Badge>
  </div>
);

export const StatusExamples: Story = () => (
  <div className="flex flex-wrap gap-2">
    <Badge variant="success">Active</Badge>
    <Badge variant="warning">Pending</Badge>
    <Badge variant="destructive">Failed</Badge>
    <Badge variant="secondary">Draft</Badge>
  </div>
);
