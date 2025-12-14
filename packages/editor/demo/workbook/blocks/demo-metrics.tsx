/**
 * Demo Metrics Block
 *
 * Sample metric cards for testing the editor sandbox.
 */
import { MetricCard } from "@hands/stdlib";

export default function DemoMetrics() {
  return (
    <div className="grid grid-cols-3 gap-4">
      <MetricCard
        title="Total Revenue"
        value="$48,352"
        trend={{ value: 12.5, direction: "up" }}
        description="vs last month"
      />
      <MetricCard
        title="Active Users"
        value="2,847"
        trend={{ value: 3.2, direction: "up" }}
        description="vs last week"
      />
      <MetricCard
        title="Churn Rate"
        value="2.4%"
        trend={{ value: 0.8, direction: "down" }}
        description="vs last quarter"
      />
    </div>
  );
}
