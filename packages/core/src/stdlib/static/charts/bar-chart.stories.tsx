import type { Story } from "@ladle/react";
import { BarChart } from "./bar-chart";
import { LiveValueProvider } from "./context";

export default {
  title: "Static/Charts/BarChart",
};

const sampleData = [
  { category: "A", value: 400, secondary: 240 },
  { category: "B", value: 300, secondary: 139 },
  { category: "C", value: 200, secondary: 980 },
  { category: "D", value: 278, secondary: 390 },
  { category: "E", value: 189, secondary: 480 },
];

export const Default: Story = () => (
  <BarChart data={sampleData} xKey="category" yKey="value" height={300} />
);

export const MultiSeries: Story = () => (
  <BarChart
    data={sampleData}
    xKey="category"
    yKey={["value", "secondary"]}
    height={300}
    showLegend
  />
);

export const Stacked: Story = () => (
  <BarChart
    data={sampleData}
    xKey="category"
    yKey={["value", "secondary"]}
    height={300}
    stacked
    showLegend
  />
);

export const Horizontal: Story = () => (
  <BarChart data={sampleData} xKey="category" yKey="value" layout="horizontal" height={300} />
);

export const NoGrid: Story = () => (
  <BarChart data={sampleData} xKey="category" yKey="value" showGrid={false} height={300} />
);

export const WithContext: Story = () => (
  <LiveValueProvider data={sampleData} isLoading={false} error={null}>
    <BarChart xKey="category" yKey="value" height={300} />
  </LiveValueProvider>
);

export const Loading: Story = () => (
  <LiveValueProvider data={[]} isLoading={true} error={null}>
    <BarChart height={300} />
  </LiveValueProvider>
);

export const Empty: Story = () => <BarChart data={[]} height={300} />;
