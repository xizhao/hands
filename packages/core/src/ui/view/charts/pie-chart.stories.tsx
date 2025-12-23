import type { Story } from "@ladle/react";
import { LiveValueProvider } from "./context";
import { PieChart } from "./pie-chart";

export default {
  title: "Static/Charts/PieChart",
};

const sampleData = [
  { name: "Desktop", value: 400 },
  { name: "Mobile", value: 300 },
  { name: "Tablet", value: 200 },
  { name: "Other", value: 100 },
];

const marketShareData = [
  { browser: "Chrome", share: 65 },
  { browser: "Firefox", share: 10 },
  { browser: "Safari", share: 15 },
  { browser: "Edge", share: 8 },
  { browser: "Other", share: 2 },
];

export const Default: Story = () => (
  <PieChart data={sampleData} valueKey="value" nameKey="name" height={300} />
);

export const Donut: Story = () => (
  <PieChart data={sampleData} valueKey="value" nameKey="name" innerRadius={60} height={300} />
);

export const WithLabels: Story = () => (
  <PieChart
    data={sampleData}
    valueKey="value"
    nameKey="name"
    showLabels
    showLegend={false}
    height={350}
  />
);

export const NoLegend: Story = () => (
  <PieChart data={sampleData} valueKey="value" nameKey="name" showLegend={false} height={300} />
);

export const CustomKeys: Story = () => (
  <PieChart data={marketShareData} valueKey="share" nameKey="browser" height={300} />
);

export const DonutWithLabels: Story = () => (
  <PieChart
    data={sampleData}
    valueKey="value"
    nameKey="name"
    innerRadius={50}
    showLabels
    height={350}
  />
);

export const WithContext: Story = () => (
  <LiveValueProvider data={sampleData} isLoading={false} error={null}>
    <PieChart valueKey="value" nameKey="name" height={300} />
  </LiveValueProvider>
);

export const Loading: Story = () => (
  <LiveValueProvider data={[]} isLoading={true} error={null}>
    <PieChart height={300} />
  </LiveValueProvider>
);

export const Empty: Story = () => <PieChart data={[]} height={300} />;
