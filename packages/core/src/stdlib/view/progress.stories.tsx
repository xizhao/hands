import type { Story } from "@ladle/react";
import { Progress } from "./progress";

export default {
  title: "Static/Progress",
};

export const Default: Story = () => <Progress value={60} />;

export const WithLabel: Story = () => <Progress value={75} label="Upload Progress" showValue />;

export const Variants: Story = () => (
  <div className="flex flex-col gap-4 max-w-md">
    <Progress value={80} label="Default" variant="default" showValue />
    <Progress value={100} label="Success" variant="success" showValue />
    <Progress value={45} label="Warning" variant="warning" showValue />
    <Progress value={20} label="Destructive" variant="destructive" showValue />
  </div>
);

export const Sizes: Story = () => (
  <div className="flex flex-col gap-4 max-w-md">
    <Progress value={60} label="Small" size="sm" />
    <Progress value={60} label="Medium" size="md" />
    <Progress value={60} label="Large" size="lg" />
  </div>
);

export const Values: Story = () => (
  <div className="flex flex-col gap-4 max-w-md">
    <Progress value={0} showValue />
    <Progress value={25} showValue />
    <Progress value={50} showValue />
    <Progress value={75} showValue />
    <Progress value={100} showValue />
  </div>
);

export const Indeterminate: Story = () => <Progress indeterminate label="Loading..." />;
