/**
 * @component metric-card
 * @name MetricCard
 * @category data
 * @description Display key metrics at a glance with optional trend indicators showing growth or decline.
 * @icon trending-up
 * @keywords metric, kpi, stat
 * @example
 * <MetricCard
 *   title="Total Revenue"
 *   value="$48,352"
 *   trend={{ value: 12.5, direction: "up" }}
 *   description="vs last month"
 * />
 */
/** @jsxImportSource react */
import type * as React from "react";
import { cn } from "../../../lib/utils.js";

export interface MetricCardProps {
  title: string;
  value: string | number;
  description?: string;
  trend?: {
    value: number;
    direction: "up" | "down" | "neutral";
  };
  icon?: React.ReactNode;
  className?: string;
}

export function MetricCard({ title, value, description, trend, icon, className }: MetricCardProps) {
  return (
    <div className={cn("rounded-xl border bg-card p-6 text-card-foreground shadow", className)}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        {icon && <div className="text-muted-foreground">{icon}</div>}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <p className="text-2xl font-bold">{value}</p>
        {trend && (
          <span
            className={cn(
              "text-sm font-medium",
              trend.direction === "up" && "text-green-600",
              trend.direction === "down" && "text-red-600",
              trend.direction === "neutral" && "text-muted-foreground",
            )}
          >
            {trend.direction === "up" && "+"}
            {trend.direction === "down" && "-"}
            {Math.abs(trend.value)}%
          </span>
        )}
      </div>
      {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
    </div>
  );
}
