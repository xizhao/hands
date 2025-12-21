import type { Story } from "@ladle/react";
import { AreaChart } from "./area-chart";
import { LiveValueProvider } from "./context";

export default {
  title: "Static/Charts/AreaChart",
};

const sampleData = [
  { date: "2024-01", pageviews: 4000, sessions: 2400 },
  { date: "2024-02", pageviews: 3000, sessions: 1398 },
  { date: "2024-03", pageviews: 5000, sessions: 2800 },
  { date: "2024-04", pageviews: 2780, sessions: 3908 },
  { date: "2024-05", pageviews: 1890, sessions: 4800 },
  { date: "2024-06", pageviews: 6390, sessions: 3800 },
];

export const Default: Story = () => (
  <AreaChart data={sampleData} xKey="date" yKey="pageviews" height={300} />
);

export const MultiSeries: Story = () => (
  <AreaChart
    data={sampleData}
    xKey="date"
    yKey={["pageviews", "sessions"]}
    height={300}
    showLegend
  />
);

export const Stacked: Story = () => (
  <AreaChart
    data={sampleData}
    xKey="date"
    yKey={["pageviews", "sessions"]}
    height={300}
    stacked
    showLegend
  />
);

export const LinearCurve: Story = () => (
  <AreaChart data={sampleData} xKey="date" yKey="pageviews" curve="linear" height={300} />
);

export const HighOpacity: Story = () => (
  <AreaChart data={sampleData} xKey="date" yKey="pageviews" fillOpacity={0.8} height={300} />
);

export const NoGrid: Story = () => (
  <AreaChart data={sampleData} xKey="date" yKey="pageviews" showGrid={false} height={300} />
);

export const WithContext: Story = () => (
  <LiveValueProvider data={sampleData} isLoading={false} error={null}>
    <AreaChart xKey="date" yKey="pageviews" height={300} />
  </LiveValueProvider>
);

export const Loading: Story = () => (
  <LiveValueProvider data={[]} isLoading={true} error={null}>
    <AreaChart height={300} />
  </LiveValueProvider>
);

export const Empty: Story = () => <AreaChart data={[]} height={300} />;
