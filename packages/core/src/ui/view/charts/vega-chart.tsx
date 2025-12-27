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
 * - Efficient data updates via Vega View API (no full re-embed)
 * - Uses CSS content-visibility for native browser virtualization
 *
 * Note: Virtualization is handled by the parent LiveValue component.
 * VegaChart assumes it's only rendered when actually visible.
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
  const viewRef = useRef<View | null>(null);
  const embedResultRef = useRef<Result | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [isEmbedded, setIsEmbedded] = useState(false);

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

  // Build spec (without data - data is injected via View API)
  const baseSpec = useMemo((): VegaLiteSpec | null => {
    // Don't build spec until we have container dimensions
    if (containerWidth <= 0) return null;

    return {
      ...spec,
      // Use measured container width
      width: containerWidth,
      height,
      // Use named data source for dynamic updates
      data: { name: DATA_SOURCE_NAME },
      // Apply theme config
      config: {
        ...vegaTheme,
        ...((spec.config as Record<string, unknown>) ?? {}),
      },
      // Autosize: "pad" grows chart to fit content including axes/labels
      autosize: {
        type: "pad",
        resize: true,
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

        // Always initialize data source (prevents "infinite extent" warnings)
        // Even empty array is better than undefined for Vega's scale calculations
        result.view.data(DATA_SOURCE_NAME, data ?? []);
        await result.view.runAsync();

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
        view.width(containerWidth);
        await view.runAsync();
      } catch (err) {
        // Ignore resize errors
      }
    };

    updateSize();
  }, [containerWidth, isEmbedded]);

  // Determine content to show inside container
  // Always render container div so containerRef is attached and ResizeObserver works
  const hasData = data && data.length > 0;
  const specHasData = spec.data !== undefined;
  const insideContext = ctx !== null;

  // Determine what overlay to show (if any)
  let overlayContent: React.ReactNode = null;
  let showVegaContainer = true;

  if (ctx?.isLoading) {
    // Loading state
    overlayContent = <ChartSkeleton height={height} />;
    showVegaContainer = false;
  } else if (ctx?.error) {
    // Error state
    overlayContent = <ChartError error={ctx.error} height={height} />;
    showVegaContainer = false;
  } else if (!hasData && !specHasData) {
    // Empty data
    if (insideContext && !ctx.data) {
      overlayContent = <ChartSkeleton height={height} />;
      showVegaContainer = false;
    } else {
      overlayContent = <ChartEmpty height={height} />;
      showVegaContainer = false;
    }
  } else if (containerWidth <= 0) {
    // Still measuring container - show skeleton but keep vega container for ref
    overlayContent = <ChartSkeleton height={height} />;
  }

  // Use two separate divs: one for React-managed content, one for Vega
  // This prevents React from trying to reconcile Vega's DOM manipulations
  return (
    <div
      className={`w-full relative ${className ?? ""}`}
      style={{ minHeight: height }}
    >
      {/* Vega container - React never modifies children, only Vega does */}
      <div
        ref={containerRef}
        className="w-full"
        style={{
          minHeight: height,
          visibility: showVegaContainer && !overlayContent ? "visible" : "hidden",
          position: showVegaContainer && !overlayContent ? "relative" : "absolute",
          top: 0,
          left: 0,
        }}
      />
      {/* React-managed overlay content */}
      {overlayContent}
    </div>
  );
}

// ============================================================================
// Exports
// ============================================================================

export { ChartSkeleton, ChartError, ChartEmpty };
