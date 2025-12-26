"use client";

/**
 * Client-only chart wrappers
 *
 * These components are marked "use client" to ensure they're only
 * loaded on the client side. RSC will serialize them as references.
 */

// Re-export chart components for use in RSC
export {
  BarChart,
  LineChart,
  AreaChart,
  PieChart,
  Chart,
  LiveValueProvider,
} from "@hands/core/ui/view";
