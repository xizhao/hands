/**
 * useContainerSize - Responsive container size detection
 *
 * Uses ResizeObserver to track container dimensions and provide
 * responsive breakpoint information for charts.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export interface ContainerSize {
  width: number;
  height: number;
}

export interface ResponsiveConfig {
  /** Container is very small (< 200px) */
  isCompact: boolean;
  /** Container is small (< 350px) */
  isSmall: boolean;
  /** Container is medium (< 500px) */
  isMedium: boolean;
  /** Show legend (hidden on small containers) */
  showLegend: boolean;
  /** Show grid lines (hidden on compact containers) */
  showGrid: boolean;
  /** Show axis labels */
  showAxisLabels: boolean;
  /** Suggested tick count for X axis */
  xTickCount: number;
  /** Suggested tick count for Y axis */
  yTickCount: number;
  /** Chart margins */
  margins: { top: number; right: number; bottom: number; left: number };
}

const BREAKPOINTS = {
  compact: 200,
  small: 350,
  medium: 500,
} as const;

/**
 * Calculate responsive config based on container width
 */
function getResponsiveConfig(width: number): ResponsiveConfig {
  const isCompact = width < BREAKPOINTS.compact;
  const isSmall = width < BREAKPOINTS.small;
  const isMedium = width < BREAKPOINTS.medium;

  return {
    isCompact,
    isSmall,
    isMedium,
    // Hide legend on small containers
    showLegend: !isSmall,
    // Hide grid on compact containers
    showGrid: !isCompact,
    // Hide axis labels on compact containers
    showAxisLabels: !isCompact,
    // Reduce ticks on smaller containers
    xTickCount: isCompact ? 2 : isSmall ? 3 : isMedium ? 5 : 7,
    yTickCount: isCompact ? 3 : isSmall ? 4 : 5,
    // Tighter margins on small containers
    margins: isCompact
      ? { top: 5, right: 5, bottom: 5, left: 5 }
      : isSmall
        ? { top: 10, right: 10, bottom: 20, left: 30 }
        : { top: 10, right: 20, bottom: 30, left: 40 },
  };
}

/**
 * Hook to track container size and provide responsive configuration.
 *
 * @example
 * const { containerRef, size, responsive } = useContainerSize();
 * return (
 *   <div ref={containerRef}>
 *     <LineChart showLegend={responsive.showLegend && userWantsLegend} />
 *   </div>
 * );
 */
export function useContainerSize() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<ContainerSize>({ width: 0, height: 0 });

  const updateSize = useCallback(() => {
    if (containerRef.current) {
      const { width, height } = containerRef.current.getBoundingClientRect();
      setSize((prev) => {
        // Only update if changed to avoid unnecessary re-renders
        if (prev.width !== width || prev.height !== height) {
          return { width, height };
        }
        return prev;
      });
    }
  }, []);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    // Initial size
    updateSize();

    // Observe resize
    const observer = new ResizeObserver(updateSize);
    observer.observe(element);

    return () => observer.disconnect();
  }, [updateSize]);

  const responsive = getResponsiveConfig(size.width);

  return {
    containerRef,
    size,
    responsive,
  };
}

export { BREAKPOINTS };
