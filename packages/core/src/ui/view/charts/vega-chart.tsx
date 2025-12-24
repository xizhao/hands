"use client";

/**
 * VegaChart - Core Vega-Lite renderer component
 *
 * Renders Vega-Lite specifications with:
 * - Automatic theme integration (CSS variables → Vega config)
 * - LiveValue context integration (data from SQL queries)
 * - Responsive container sizing
 * - Efficient data updates via Vega View API (no full re-embed)
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
import embed, { type EmbedOptions, type Result } from "vega-embed";
import type { View } from "vega";

import type { VegaLiteSpec } from "../../../types";
import { useLiveValueData } from "./context";
import { useVegaTheme } from "./vega-theme";
import { useViewportVisibility } from "../../lib/virtualization";

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

/**
 * Lightweight placeholder shown for charts outside viewport.
 */
function ChartPlaceholder({
  height,
  className,
  viewportRef,
}: {
  height: number;
  className?: string;
  viewportRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div
      ref={viewportRef}
      className={`w-full flex items-center justify-center bg-muted/5 rounded-lg border border-dashed border-muted-foreground/20 ${className ?? ""}`}
      style={{ height }}
    >
      <span className="text-muted-foreground/40 text-xs font-medium">Chart</span>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

/** Data source name used in Vega spec */
const DATA_SOURCE_NAME = "source";

/**
 * VegaChart renders a Vega-Lite specification.
 *
 * Features:
 * - Automatic theme integration via CSS variables
 * - Data from LiveValue context or props
 * - Canvas rendering for performance
 * - Responsive width (fills container)
 * - Efficient data updates via View API (no full re-embed)
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
  // Viewport virtualization - only embed when in/near viewport
  // Uses shared observer for efficiency with many charts
  const { ref: viewportRef, isVisible } = useViewportVisibility({ margin: "300px" });

  const ctx = useLiveValueData();
  const vegaTheme = useVegaTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<View | null>(null);
  const embedResultRef = useRef<Result | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [isEmbedded, setIsEmbedded] = useState(false);

  // Determine data source: props > context > spec
  const data = propData ?? (useContextData && ctx?.data) ?? undefined;

  // Show placeholder until chart scrolls into viewport
  // This prevents expensive Vega embedding for off-screen charts
  if (!isVisible) {
    return <ChartPlaceholder height={height} className={className} viewportRef={viewportRef} />;
  }

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

  // Build spec (without data - data is injected via View API)
  const baseSpec = useMemo((): VegaLiteSpec => {
    // Don't build spec until we have container dimensions
    if (containerWidth <= 0) return null as unknown as VegaLiteSpec;

    return {
      ...spec,
      // Use measured container width minus horizontal padding
      width: containerWidth - 10,
      height: height - 30,
      // Use named data source for dynamic updates
      data: { name: DATA_SOURCE_NAME },
      // Apply theme config
      config: {
        ...vegaTheme,
        ...((spec.config as Record<string, unknown>) ?? {}),
      },
      // Padding for axis labels (bottom for angled x-axis labels)
      padding: { top: 5, right: 5, bottom: 25, left: 5 },
      // Autosize to fit within padding
      autosize: {
        type: "fit",
        contains: "padding",
      },
    };
  }, [spec, height, vegaTheme, containerWidth]);

  // Stable spec key for re-embedding only when spec structure changes
  const specKey = useMemo(() => {
    // Hash based on spec structure (excluding data)
    const { data: _, ...specWithoutData } = spec;
    return JSON.stringify(specWithoutData);
  }, [spec]);

  // Embed chart (only when spec structure changes)
  useEffect(() => {
    const container = containerRef.current;
    // Wait for both container and valid spec (which requires containerWidth > 0)
    if (!container || !baseSpec) return;

    let cancelled = false;

    const doEmbed = async () => {
      // Clean up previous embed
      if (embedResultRef.current) {
        embedResultRef.current.finalize();
        embedResultRef.current = null;
        viewRef.current = null;
      }

      const options: EmbedOptions = {
        renderer,
        actions,
        // Don't download data - we inject it via View API
        loader: { target: "_blank" },
      };

      try {
        const result = await embed(container, baseSpec as any, options);
        if (cancelled) {
          result.finalize();
          return;
        }

        embedResultRef.current = result;
        viewRef.current = result.view;

        // Inject initial data if available
        if (data && data.length > 0) {
          result.view.data(DATA_SOURCE_NAME, data);
          await result.view.runAsync();
        }

        setIsEmbedded(true);
      } catch (err) {
        console.error("[VegaChart] Embed failed:", err);
      }
    };

    doEmbed();

    return () => {
      cancelled = true;
      if (embedResultRef.current) {
        embedResultRef.current.finalize();
        embedResultRef.current = null;
        viewRef.current = null;
      }
    };
  }, [specKey, baseSpec, renderer, actions]); // Note: data not in deps - handled separately

  // Update data efficiently via View API (no re-embed)
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !isEmbedded) return;

    const updateData = async () => {
      try {
        view.data(DATA_SOURCE_NAME, data ?? []);
        await view.runAsync();
      } catch (err) {
        console.error("[VegaChart] Data update failed:", err);
      }
    };

    updateData();
  }, [data, isEmbedded]);

  // Update dimensions when container resizes
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !isEmbedded || containerWidth <= 0) return;

    const updateSize = async () => {
      try {
        // Match the padding used in baseSpec
        view.width(containerWidth - 10);
        await view.runAsync();
      } catch (err) {
        // Ignore resize errors
      }
    };

    updateSize();
  }, [containerWidth, isEmbedded]);

  // Handle loading state
  if (ctx?.isLoading) {
    return <ChartSkeleton height={height} className={className} />;
  }

  // Show skeleton while measuring container (prevents invisible chart)
  if (containerWidth <= 0) {
    return (
      <div
        ref={containerRef}
        className={`w-full ${className ?? ""}`}
        style={{ minHeight: height }}
      >
        <ChartSkeleton height={height} />
      </div>
    );
  }

  // Handle error state
  if (ctx?.error) {
    return <ChartError error={ctx.error} height={height} className={className} />;
  }

  // Handle empty data
  const hasData = data && data.length > 0;
  const specHasData = spec.data !== undefined;
  const insideContext = ctx !== null;
  if (!hasData && !specHasData) {
    // If inside a LiveValue context but no data yet, show loading
    if (insideContext && !ctx.data) {
      return <ChartSkeleton height={height} className={className} />;
    }
    return <ChartEmpty height={height} className={className} />;
  }

  return (
    <div
      ref={containerRef}
      className={`w-full ${className ?? ""}`}
      style={{ minHeight: height }}
    />
  );
}

// ============================================================================
// Exports
// ============================================================================

export { ChartSkeleton, ChartError, ChartEmpty };
