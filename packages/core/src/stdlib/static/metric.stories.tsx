import type { Story } from "@ladle/react";
import { Metric } from "./metric";

export default {
  title: "Static/Metric",
};

export const Default: Story = () => <Metric value={1234} label="Total Users" />;

export const WithChange: Story = () => (
  <Metric value={50000} label="Revenue" prefix="$" change={12.5} changeLabel="vs last month" />
);

export const NegativeChange: Story = () => (
  <Metric value={0.5} label="Error Rate" suffix="%" change={-8} changeLabel="vs last week" />
);

export const Sizes: Story = () => (
  <div className="flex gap-8">
    <Metric value={1234} label="Small" size="sm" />
    <Metric value={1234} label="Medium" size="md" />
    <Metric value={1234} label="Large" size="lg" />
  </div>
);

export const Dashboard: Story = () => (
  <div className="grid grid-cols-3 gap-6">
    <div className="p-4 border rounded-lg">
      <Metric value={2350} label="Total Users" change={5.2} />
    </div>
    <div className="p-4 border rounded-lg">
      <Metric value={48352} label="Revenue" prefix="$" change={12.5} />
    </div>
    <div className="p-4 border rounded-lg">
      <Metric value={98.5} label="Uptime" suffix="%" change={0.1} />
    </div>
  </div>
);
