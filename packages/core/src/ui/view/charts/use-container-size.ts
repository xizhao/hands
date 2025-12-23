/**
 * useContainerSize - Responsive container size detection
 *
 * Uses ResizeObserver to track container dimensions and provide
 * responsive breakpoint information for charts.
 *
 * Performance optimized:
 * - Debounces resize updates to avoid excessive re-renders
 * - Only triggers state updates when crossing breakpoint thresholds
 */

import { useEffect, useMemo, useRef, useState } from "react";

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

/** Debounce delay in ms - balances responsiveness vs performance */
const DEBOUNCE_MS = 100;

/**
 * Get the breakpoint bucket for a width (used to avoid updates within same bucket)
 */
function getBreakpointBucket(width: number): number {
  if (width < BREAKPOINTS.compact) return 0;
  if (width < BREAKPOINTS.small) return 1;
  if (width < BREAKPOINTS.medium) return 2;
  return 3;
}

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
 * Performance optimizations:
 * - Debounces resize events to reduce re-renders during drag
 * - Only updates state when width crosses a breakpoint threshold
 * - Uses RAF for smooth updates
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
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastBucketRef = useRef<number>(-1);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const updateSize = () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }

      rafRef.current = requestAnimationFrame(() => {
        if (!containerRef.current) return;
        const { width, height } = containerRef.current.getBoundingClientRect();
        const bucket = getBreakpointBucket(width);

        // Always update on initial render or when crossing breakpoints
        // Skip updates within the same breakpoint bucket during resize
        if (lastBucketRef.current === -1 || bucket !== lastBucketRef.current) {
          lastBucketRef.current = bucket;
          setSize({ width, height });
        }
      });
    };

    const debouncedUpdate = () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      debounceRef.current = setTimeout(updateSize, DEBOUNCE_MS);
    };

    // Initial size (immediate, no debounce)
    updateSize();

    // Observe resize with debouncing
    const observer = new ResizeObserver(debouncedUpdate);
    observer.observe(element);

    return () => {
      observer.disconnect();
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const responsive = useMemo(() => getResponsiveConfig(size.width), [size.width]);

  return {
    containerRef,
    size,
    responsive,
  };
}

export { BREAKPOINTS };
