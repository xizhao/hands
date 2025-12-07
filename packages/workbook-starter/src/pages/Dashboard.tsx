import * as React from "react";
import { Chart } from "@/components/charts";
import type { Chart as ChartConfig } from "../../charts";

interface DashboardProps {
  charts: ChartConfig[];
  chartData: Record<string, Record<string, unknown>[]>;
}

export function Dashboard({ charts, chartData }: DashboardProps) {
  if (charts.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold">No charts configured</h1>
          <p className="text-muted-foreground mt-2">
            Add chart definitions to <code>charts/index.ts</code>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-6 md:grid-cols-2">
          {charts.map((chart) => (
            <Chart
              key={chart.id}
              type={chart.type}
              title={chart.title}
              description={chart.description}
              data={chartData[chart.id] || []}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
