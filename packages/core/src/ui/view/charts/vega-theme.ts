/**
 * Vega Theme Bridge
 *
 * Bridges CSS variables from the Tailwind/shadcn theme to Vega-Lite config.
 * Automatically updates when theme changes (e.g., dark mode toggle).
 */

import { useCallback, useSyncExternalStore } from "react";
import type { Config } from "vega-lite";

// ============================================================================
// CSS Variable Helpers
// ============================================================================

/**
 * Get a CSS variable value from the document root.
 * Returns the raw value (e.g., "220 70% 50%" for HSL).
 */
function getCssVar(name: string): string {
  if (typeof document === "undefined") return "";
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/**
 * Get a CSS color variable value.
 * Handles hex colors, hsl() wrapped values, and raw HSL values.
 */
function getColorVar(name: string): string {
  const value = getCssVar(name);
  if (!value) return "";
  // If hex color or already wrapped in hsl()/rgb(), return as-is
  if (value.startsWith("#") || value.startsWith("hsl") || value.startsWith("rgb")) {
    return value;
  }
  // Otherwise assume raw HSL values and wrap them
  return `hsl(${value})`;
}

// ============================================================================
// Vega Config Factory
// ============================================================================

/**
 * Create a Vega-Lite config object from CSS variables.
 * Maps theme colors to Vega styling properties.
 */
export function createVegaConfig(): Config {
  const foreground = getColorVar("--foreground");
  const border = getColorVar("--border");
  const background = getColorVar("--background");

  // Chart color palette from CSS variables
  const chartColors = [
    getColorVar("--chart-1"),
    getColorVar("--chart-2"),
    getColorVar("--chart-3"),
    getColorVar("--chart-4"),
    getColorVar("--chart-5"),
  ].filter(Boolean);

  // Fallback colors if CSS vars not defined (use hex for Vega compatibility)
  const defaultColors = [
    "#3b82f6", // blue
    "#22c55e", // green
    "#f97316", // orange
    "#a855f7", // purple
    "#ec4899", // pink
  ];

  const colors = chartColors.length > 0 ? chartColors : defaultColors;

  return {
    // Transparent background - let container handle it
    background: "transparent",

    // Axis styling
    axis: {
      labelColor: foreground || "#71717a",
      titleColor: foreground || "#71717a",
      gridColor: border || "#3f3f46",
      domainColor: border || "#3f3f46",
      tickColor: border || "#3f3f46",
      labelFont: "system-ui, sans-serif",
      titleFont: "system-ui, sans-serif",
      labelFontSize: 11,
      titleFontSize: 12,
      titleFontWeight: 500,
    },

    // Legend styling
    legend: {
      labelColor: foreground || "#71717a",
      titleColor: foreground || "#71717a",
      labelFont: "system-ui, sans-serif",
      titleFont: "system-ui, sans-serif",
      labelFontSize: 11,
      titleFontSize: 12,
    },

    // Title styling
    title: {
      color: foreground || "#71717a",
      font: "system-ui, sans-serif",
      fontSize: 14,
      fontWeight: 600,
    },

    // Color range for categorical data
    range: {
      category: colors,
    },

    // Mark defaults - use first chart color for single-series
    mark: {
      tooltip: true,
      color: colors[0] || "#3b82f6",
    },

    // Line mark defaults
    line: {
      strokeWidth: 2,
      stroke: colors[0] || "#3b82f6",
    },

    // Point mark defaults
    point: {
      size: 60,
      filled: true,
      fill: colors[0] || "#3b82f6",
    },

    // Bar mark defaults
    bar: {
      cornerRadiusEnd: 4,
      fill: colors[0] || "#3b82f6",
    },

    // Area mark defaults
    area: {
      opacity: 0.4,
      fill: colors[0] || "#3b82f6",
    },

    // Arc mark defaults (for pie/donut)
    arc: {
      stroke: background || "#09090b",
      strokeWidth: 2,
    },

    // View defaults
    view: {
      stroke: "transparent",
    },
  };
}

// ============================================================================
// Theme Hook
// ============================================================================

// Cache the config to avoid recalculating on every render
let cachedConfig: Config | null = null;
let cacheKey: string | null = null;

function getConfig(): Config {
  // Use class attribute as cache key (changes on theme toggle)
  const key = typeof document !== "undefined" ? document.documentElement.className : "";

  if (cachedConfig && cacheKey === key) {
    return cachedConfig;
  }

  cachedConfig = createVegaConfig();
  cacheKey = key;
  return cachedConfig;
}

function getServerConfig(): Config {
  // Return default config for SSR
  return createVegaConfig();
}

/**
 * Hook to get Vega theme config that updates on theme changes.
 *
 * Uses MutationObserver to watch for class changes on <html> element
 * (which is how most dark mode implementations work).
 *
 * @example
 * ```tsx
 * function MyChart() {
 *   const vegaTheme = useVegaTheme();
 *   return <VegaLite spec={{ ...spec, config: vegaTheme }} />;
 * }
 * ```
 */
export function useVegaTheme(): Config {
  const subscribe = useCallback((callback: () => void) => {
    if (typeof document === "undefined") {
      return () => {};
    }

    // Watch for class changes on document element (dark mode toggle)
    const observer = new MutationObserver(() => {
      // Invalidate cache
      cachedConfig = null;
      cacheKey = null;
      callback();
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme", "style"],
    });

    // Also listen for system theme changes
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      cachedConfig = null;
      cacheKey = null;
      callback();
    };
    mediaQuery.addEventListener("change", handleChange);

    return () => {
      observer.disconnect();
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, []);

  return useSyncExternalStore(subscribe, getConfig, getServerConfig);
}

// ============================================================================
// Exports
// ============================================================================

export type { Config as VegaConfig };
