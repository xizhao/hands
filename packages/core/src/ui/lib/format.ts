/**
 * Number Formatting Utilities
 *
 * Provides smart auto-detection and formatting for chart axes and values.
 * Uses d3-format for consistent, locale-aware number formatting.
 */

import { format as d3Format } from "d3-format";

// ============================================================================
// Format Presets
// ============================================================================

export const FORMAT_PRESETS = {
  /** Currency with commas, no decimals: $1,234 */
  currency: "$,.0f",
  /** Currency compact with suffix: $1.2M */
  currencyCompact: "$,.2s",
  /** Percentage with 1 decimal: 12.3% */
  percent: ".1%",
  /** Integer with commas: 1,234 */
  integer: ",.0f",
  /** Decimal with 2 places: 3.14 */
  decimal: ",.2f",
  /** Compact with K/M/B suffix: 1.2M */
  compact: ".2s",
} as const;

export type FormatPreset = keyof typeof FORMAT_PRESETS;

// ============================================================================
// Auto-Detection Patterns
// ============================================================================

/** Column names that suggest currency values */
const CURRENCY_PATTERNS =
  /^(revenue|price|cost|amount|total|salary|income|expense|profit|fee|budget|spend|sales|earnings|margin|value)s?$/i;

/** Column names that suggest percentage values */
const PERCENT_PATTERNS =
  /^(rate|percent|pct|ratio|share|growth|change|chg|yield|return|margin_pct|conversion|ctr|bounce)s?$/i;

/** Column names that suggest count/integer values */
const COUNT_PATTERNS =
  /^(count|num|number|qty|quantity|total|users|sessions|views|clicks|orders|items)s?$/i;

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Auto-detect the best format for a column based on its name and values.
 *
 * @param columnName - The column/field name (e.g., "revenue", "growth_rate")
 * @param values - Sample values from the column
 * @returns d3-format string or null if no special formatting needed
 *
 * @example
 * ```ts
 * detectFormat("revenue", [1500000, 2300000]) // "$,.2s" (compact currency)
 * detectFormat("growth_rate", [0.12, 0.08])   // ".1%" (percentage)
 * detectFormat("users", [1234, 5678])         // ",.0f" (integer with commas)
 * ```
 */
export function detectFormat(
  columnName: string,
  values: unknown[],
): string | null {
  const nums = values.filter((v): v is number => typeof v === "number");
  if (nums.length === 0) return null;

  const max = Math.max(...nums.map(Math.abs));
  const min = Math.min(...nums);

  // Check column name patterns first
  if (CURRENCY_PATTERNS.test(columnName)) {
    return max >= 1_000_000 ? "$,.2s" : "$,.0f";
  }

  if (PERCENT_PATTERNS.test(columnName)) {
    // Values 0-1 are decimals that should be formatted as percentages
    // Values 0-100 are already percentages, just add symbol
    if (max <= 1 && min >= -1) {
      return ".1%"; // d3 multiplies by 100 automatically
    }
    return ".1f"; // Already a percentage, just format nicely
  }

  if (COUNT_PATTERNS.test(columnName)) {
    return max >= 1_000_000 ? ".2s" : ",.0f";
  }

  // Fall back to magnitude-based detection
  if (max >= 1_000_000) {
    return ".2s"; // Compact: 1.2M
  }

  if (max >= 10_000) {
    return ",.0f"; // Commas, no decimals
  }

  // Small numbers - check if they need decimals
  const hasDecimals = nums.some((n) => n % 1 !== 0);
  if (hasDecimals && max < 100) {
    return ",.2f"; // 2 decimal places
  }

  return null; // No special formatting
}

/**
 * Format a number using a d3-format specification string.
 *
 * @param value - The number to format
 * @param formatSpec - d3-format specification (e.g., "$,.0f", ".2s", ".1%")
 * @returns Formatted string
 *
 * @example
 * ```ts
 * formatValue(1234567, "$,.2s")  // "$1.2M"
 * formatValue(0.1234, ".1%")     // "12.3%"
 * formatValue(1234, ",.0f")      // "1,234"
 * ```
 */
export function formatValue(value: number, formatSpec: string): string {
  try {
    return d3Format(formatSpec)(value);
  } catch {
    // Fall back to basic formatting if spec is invalid
    return value.toLocaleString();
  }
}

/**
 * Get a format spec from a preset name or return the spec as-is.
 *
 * @param formatOrPreset - Either a preset name or a d3-format spec
 * @returns d3-format specification string
 *
 * @example
 * ```ts
 * resolveFormat("currency")     // "$,.0f"
 * resolveFormat("$,.2s")        // "$,.2s" (passthrough)
 * ```
 */
export function resolveFormat(formatOrPreset: string): string {
  if (formatOrPreset in FORMAT_PRESETS) {
    return FORMAT_PRESETS[formatOrPreset as FormatPreset];
  }
  return formatOrPreset;
}

/**
 * Detect and format a value in one step.
 * Useful when you have the column name and want auto-formatting.
 *
 * @param value - The number to format
 * @param columnName - Column name for auto-detection
 * @param allValues - All values in the column (for magnitude detection)
 * @returns Formatted string
 */
export function autoFormat(
  value: number,
  columnName: string,
  allValues: unknown[],
): string {
  const format = detectFormat(columnName, allValues);
  if (format) {
    return formatValue(value, format);
  }
  return value.toLocaleString();
}
