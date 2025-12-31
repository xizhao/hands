/**
 * Table Editor Utilities
 *
 * Helper functions for the TableEditor component.
 */

import type { ColumnDefinition } from "./types";

/**
 * Get recommended column width based on column type.
 */
export function getColumnWidth(col: ColumnDefinition): number {
  const type = col.type.toLowerCase();

  if (type === "boolean") return 80;
  if (type.includes("uuid")) return 280;
  if (type.includes("timestamp") || type.includes("date")) return 180;
  if (type.includes("int") || type.includes("numeric")) return 100;
  if (type.includes("text") || type.includes("varchar")) return 200;
  if (type.includes("json")) return 250;

  return 150;
}

/**
 * Convert CSS variable HSL value to actual hsl() string.
 * CSS vars are stored as "0 0% 100%" format, convert to "hsl(0 0% 100%)".
 */
export function getCssVar(name: string): string {
  if (typeof window === "undefined") return "#000";

  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  if (!value) return "#000";

  return `hsl(${value})`;
}

/**
 * Blend a color with background at given opacity - returns SOLID color.
 * Canvas needs solid colors to avoid ghosting artifacts from transparency.
 */
export function blendWithBackground(colorVar: string, bgVar: string, opacity: number): string {
  if (typeof window === "undefined") return "#000";

  const style = getComputedStyle(document.documentElement);
  const colorHsl = style.getPropertyValue(colorVar).trim();
  const bgHsl = style.getPropertyValue(bgVar).trim();

  if (!colorHsl || !bgHsl) return "#000";

  // Parse HSL values (format: "H S% L%")
  const parseHsl = (hsl: string) => {
    const parts = hsl.split(/\s+/);
    return {
      h: parseFloat(parts[0]) || 0,
      s: parseFloat(parts[1]) || 0,
      l: parseFloat(parts[2]) || 0,
    };
  };

  const color = parseHsl(colorHsl);
  const bg = parseHsl(bgHsl);

  // Blend lightness (simplified blend - works well for most cases)
  const blendedL = bg.l + (color.l - bg.l) * opacity;
  // For saturation, reduce it towards background
  const blendedS = bg.s + (color.s - bg.s) * opacity;
  // Keep hue from the color
  const blendedH = color.h;

  return `hsl(${blendedH} ${blendedS}% ${blendedL}%)`;
}
