"use client";

/**
 * VegaChart - Core Vega-Lite renderer component
 *
 * Renders Vega-Lite specifications with:
 * - Automatic theme integration (CSS variables → Vega config)
 * - LiveValue context integration (data from SQL queries)
 * - Responsive container sizing
 * - Canvas rendering for performance
 *
 * @example
 * ```tsx
 * <VegaChart
 *   spec={{
 *     mark: "bar",
 *     encoding: {
 *       x: { field: "category", type: "nominal" },
 *       y: { field: "value", type: "quantitative" },
 *     },
 *   }}
 *   height={300}
 * />
 * ```
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { VegaEmbed } from "react-vega";
import type { VisualizationSpec } from "vega-embed";

import type { VegaLiteSpec } from "../../../types";
import { useLiveValueData } from "./context";
import { useVegaTheme } from "./vega-theme";

// ============================================================================
// Types
// ============================================================================

export interface VegaChartProps {
  /** Vega-Lite specification (without data if using LiveValue context) */
  spec: VegaLiteSpec;
  /** Chart height in pixels */
  height?: number;
  /** Whether to use data from LiveValue context (default: true) */
  useContextData?: boolean;
  /** Override data (takes precedence over context) */
  data?: Record<string, unknown>[];
  /** Additional CSS classes */
  className?: string;
  /** Renderer type (default: canvas for performance) */
  renderer?: "canvas" | "svg";
  /** Show Vega action buttons (default: false) */
  actions?: boolean;
}

// ============================================================================
// Loading/Error States
// ============================================================================

interface ChartSkeletonProps {
  height: number;
  className?: string;
}

function ChartSkeleton({ height, className }: ChartSkeletonProps) {
  return (
    <div
      className={`w-full flex items-center justify-center bg-muted/30 rounded-lg animate-pulse ${className ?? ""}`}
      style={{ height }}
    >
      <span className="text-muted-foreground text-sm">Loading chart...</span>
    </div>
  );
}

interface ChartErrorProps {
  error: Error;
  height: number;
  className?: string;
}

function ChartError({ error, height, className }: ChartErrorProps) {
  return (
    <div
      className={`w-full flex items-center justify-center bg-destructive/10 rounded-lg ${className ?? ""}`}
      style={{ height }}
    >
      <span className="text-destructive text-sm">Error: {error.message}</span>
    </div>
  );
}

interface ChartEmptyProps {
  height: number;
  className?: string;
}

function ChartEmpty({ height, className }: ChartEmptyProps) {
  return (
    <div
      className={`w-full flex items-center justify-center bg-muted/30 rounded-lg ${className ?? ""}`}
      style={{ height }}
    >
      <span className="text-muted-foreground text-sm">No data</span>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

/**
 * VegaChart renders a Vega-Lite specification.
 *
 * Features:
 * - Automatic theme integration via CSS variables
 * - Data from LiveValue context or props
 * - Canvas rendering for performance
 * - Responsive width (fills container)
 */
export function VegaChart({
  spec,
  height = 300,
  useContextData = true,
  data: propData,
  className,
  renderer = "canvas",
  actions = false,
}: VegaChartProps) {
  const ctx = useLiveValueData();
  const vegaTheme = useVegaTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  // Determine data source: props > context > spec
  const data = propData ?? (useContextData && ctx?.data) ?? undefined;

  // Track container width for responsive charts
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setContainerWidth(entry.contentRect.width);
      }
    });

    observer.observe(element);
    // Initial measurement
    setContainerWidth(element.getBoundingClientRect().width);

    return () => observer.disconnect();
  }, []);

  // Build final spec with data, theme, and sizing
  const finalSpec = useMemo((): VegaLiteSpec => {
    return {
      ...spec,
      // Responsive width
      width: containerWidth > 0 ? containerWidth - 20 : undefined,
      height,
      // Inject data if provided
      ...(data ? { data: { values: data } } : {}),
      // Apply theme config
      config: {
        ...vegaTheme,
        ...((spec.config as Record<string, unknown>) ?? {}),
      },
      // Autosize to fit container
      autosize: {
        type: "fit",
        contains: "padding",
      },
    };
  }, [spec, height, data, vegaTheme, containerWidth]);

  // Handle loading state
  if (ctx?.isLoading) {
    return <ChartSkeleton height={height} className={className} />;
  }

  // Handle error state
  if (ctx?.error) {
    return <ChartError error={ctx.error} height={height} className={className} />;
  }

  // Handle empty data
  // Only show "No data" if we're NOT inside a LiveValue context waiting for data
  // If inside context, prefer showing loading skeleton while waiting
  const hasData = data && data.length > 0;
  const specHasData = spec.data !== undefined;
  const insideContext = ctx !== null;
  if (!hasData && !specHasData) {
    // If inside a LiveValue context but no data yet, show loading (might be initial render)
    if (insideContext && !ctx.data) {
      return <ChartSkeleton height={height} className={className} />;
    }
    return <ChartEmpty height={height} className={className} />;
  }

  return (
    <div ref={containerRef} className={`w-full ${className ?? ""}`}>
      {containerWidth > 0 && (
        <VegaEmbed
          spec={finalSpec as VisualizationSpec}
          options={{
            renderer,
            actions,
          }}
        />
      )}
    </div>
  );
}

// ============================================================================
// Exports
// ============================================================================

export { ChartSkeleton, ChartError, ChartEmpty };
// Re-export VisualizationSpec for advanced use cases
export type { VisualizationSpec };
