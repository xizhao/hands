import type { Story } from "@ladle/react";
import { LiveValueProvider } from "./context";
import { LineChart } from "./line-chart";

export default {
  title: "Static/Charts/LineChart",
};

const sampleData = [
  { month: "Jan", revenue: 4000, expenses: 2400 },
  { month: "Feb", revenue: 3000, expenses: 1398 },
  { month: "Mar", revenue: 2000, expenses: 9800 },
  { month: "Apr", revenue: 2780, expenses: 3908 },
  { month: "May", revenue: 1890, expenses: 4800 },
  { month: "Jun", revenue: 2390, expenses: 3800 },
];

export const Default: Story = () => (
  <LineChart data={sampleData} xKey="month" yKey="revenue" height={300} />
);

export const MultiSeries: Story = () => (
  <LineChart
    data={sampleData}
    xKey="month"
    yKey={["revenue", "expenses"]}
    height={300}
    showLegend
  />
);

export const LinearCurve: Story = () => (
  <LineChart data={sampleData} xKey="month" yKey="revenue" curve="linear" height={300} />
);

export const StepCurve: Story = () => (
  <LineChart data={sampleData} xKey="month" yKey="revenue" curve="step" height={300} />
);

export const NoDots: Story = () => (
  <LineChart data={sampleData} xKey="month" yKey="revenue" showDots={false} height={300} />
);

export const NoGrid: Story = () => (
  <LineChart data={sampleData} xKey="month" yKey="revenue" showGrid={false} height={300} />
);

export const WithContext: Story = () => (
  <LiveValueProvider data={sampleData} isLoading={false} error={null}>
    <LineChart xKey="month" yKey="revenue" height={300} />
  </LiveValueProvider>
);

export const Loading: Story = () => (
  <LiveValueProvider data={[]} isLoading={true} error={null}>
    <LineChart height={300} />
  </LiveValueProvider>
);

const queryError = new Error("Query failed");

export const ErrorState: Story = () => (
  <LiveValueProvider data={[]} isLoading={false} error={queryError}>
    <LineChart height={300} />
  </LiveValueProvider>
);

export const Empty: Story = () => <LineChart data={[]} height={300} />;
