/**
 * LiveQuery Format System
 *
 * Unified data-shape-aware format options for LiveQuery elements.
 * Used by both At Menu (insertion) and Turn Into (transforms).
 *
 * Data shapes:
 * - single: 1 row, 1 column → inline badge or metric
 * - list: N rows, 1 column → bullet/numbered list
 * - table: N rows, M columns → data table
 * - card: 1 row, M columns → single card with multiple fields
 */

import type { TElement } from "platejs";
import type { ReactNode } from "react";
import {
  Lightning,
  ListBullets,
  NumberCircleOne,
  Table,
  Cards,
  Rows,
  Hash,
} from "@phosphor-icons/react";
import { createElement } from "react";

// ============================================================================
// Data Shape Detection
// ============================================================================

export type DataShape = "single" | "list" | "table" | "card";

export interface DataShapeInfo {
  shape: DataShape;
  rowCount: number;
  columnCount: number;
}

/**
 * Detect the shape of query result data.
 */
export function detectDataShape(data: Record<string, unknown>[]): DataShapeInfo {
  if (!data || data.length === 0) {
    return { shape: "table", rowCount: 0, columnCount: 0 };
  }

  const rowCount = data.length;
  const columnCount = Object.keys(data[0]).length;

  if (rowCount === 1 && columnCount === 1) {
    return { shape: "single", rowCount, columnCount };
  }

  if (rowCount === 1 && columnCount > 1) {
    return { shape: "card", rowCount, columnCount };
  }

  if (columnCount === 1) {
    return { shape: "list", rowCount, columnCount };
  }

  return { shape: "table", rowCount, columnCount };
}

/**
 * Infer data shape from SQL query (heuristic).
 * Used when data hasn't been fetched yet.
 */
export function inferShapeFromSQL(sql: string | undefined): DataShape | null {
  if (!sql) return null;
  const upper = sql.toUpperCase().trim();

  // COUNT/SUM/AVG/MAX/MIN without GROUP BY → single value
  const hasAggregate = /\b(COUNT|SUM|AVG|MAX|MIN)\s*\(/i.test(sql);
  const hasGroupBy = /\bGROUP\s+BY\b/i.test(sql);
  const hasLimit1 = /\bLIMIT\s+1\b/i.test(sql);

  if (hasAggregate && !hasGroupBy) {
    return "single";
  }

  // Single column SELECT with LIMIT 1 → single
  const selectMatch = sql.match(/SELECT\s+([\w"`.]+)\s+FROM/i);
  if (selectMatch && hasLimit1) {
    const cols = selectMatch[1].trim();
    if (!cols.includes(",") && cols !== "*") {
      return "single";
    }
  }

  // SELECT * → table
  if (/SELECT\s+\*\s+FROM/i.test(sql)) {
    return "table";
  }

  // Single column without LIMIT → list
  if (selectMatch) {
    const cols = selectMatch[1].trim();
    if (!cols.includes(",") && cols !== "*") {
      return "list";
    }
  }

  return null;
}

// ============================================================================
// Format Definitions
// ============================================================================

export type FormatKey = "inline" | "metric" | "bullet-list" | "numbered-list" | "table" | "card" | "row";

export interface FormatOption {
  key: FormatKey;
  label: string;
  description: string;
  icon: ReactNode;
  /** Data shapes this format is valid for */
  validShapes: DataShape[];
  /** If true, uses inline element instead of block */
  inline?: boolean;
}

/**
 * All available LiveQuery formats.
 * Ordered by typical usage frequency.
 */
export const FORMAT_OPTIONS: FormatOption[] = [
  {
    key: "inline",
    label: "Inline",
    description: "Badge in text",
    icon: createElement(Lightning, { weight: "fill", className: "size-3.5" }),
    validShapes: ["single"],
    inline: true,
  },
  {
    key: "metric",
    label: "Metric",
    description: "Large value",
    icon: createElement(NumberCircleOne, { weight: "fill", className: "size-3.5" }),
    validShapes: ["single"],
  },
  {
    key: "bullet-list",
    label: "List",
    description: "Bullet list",
    icon: createElement(ListBullets, { weight: "fill", className: "size-3.5" }),
    validShapes: ["list"],
  },
  {
    key: "numbered-list",
    label: "Numbered",
    description: "Numbered list",
    icon: createElement(Hash, { weight: "fill", className: "size-3.5" }),
    validShapes: ["list"],
  },
  {
    key: "table",
    label: "Table",
    description: "Data table",
    icon: createElement(Table, { weight: "fill", className: "size-3.5" }),
    validShapes: ["table", "list", "card"],
  },
  {
    key: "card",
    label: "Card",
    description: "Field card",
    icon: createElement(Cards, { weight: "fill", className: "size-3.5" }),
    validShapes: ["card", "single"],
  },
  {
    key: "row",
    label: "Row",
    description: "Label: value",
    icon: createElement(Rows, { weight: "fill", className: "size-3.5" }),
    validShapes: ["table", "card"],
  },
];

/**
 * Get formats valid for a data shape.
 */
export function getValidFormats(shape: DataShape): FormatOption[] {
  return FORMAT_OPTIONS.filter((f) => f.validShapes.includes(shape));
}

/**
 * Get the default format for a data shape.
 */
export function getDefaultFormat(shape: DataShape): FormatKey {
  switch (shape) {
    case "single":
      return "inline";
    case "list":
      return "bullet-list";
    case "card":
      return "card";
    case "table":
    default:
      return "table";
  }
}

/**
 * Get formats valid for actual data.
 */
export function getFormatsForData(data: Record<string, unknown>[]): FormatOption[] {
  const { shape } = detectDataShape(data);
  return getValidFormats(shape);
}

// ============================================================================
// Template Definitions (Plate element arrays)
// ============================================================================

/**
 * Template content for each format.
 * These are Plate element arrays with {{field}} bindings.
 */
export const TEMPLATES: Record<FormatKey, TElement[]> = {
  // Inline doesn't use template (rendered specially)
  inline: [],

  metric: [
    { type: "h1", children: [{ text: "{{value}}" }] },
  ],

  "bullet-list": [
    { type: "p", children: [{ text: "• {{name}}" }] },
  ],

  "numbered-list": [
    { type: "p", children: [{ text: "{{_index}}. {{name}}" }] },
  ],

  table: [], // Empty = table mode (columns: "auto")

  card: [
    { type: "h3", children: [{ text: "{{title}}" }] },
    { type: "p", children: [{ text: "{{description}}" }] },
  ],

  row: [
    {
      type: "p",
      children: [
        { text: "{{name}}", bold: true },
        { text: " — " },
        { text: "{{value}}" },
      ],
    },
  ],
};

/**
 * Get template for a format key.
 */
export function getTemplate(key: FormatKey): TElement[] {
  return TEMPLATES[key] ?? [];
}

/**
 * Check if format uses table mode (columns prop instead of template).
 */
export function isTableMode(key: FormatKey): boolean {
  return key === "table";
}

/**
 * Check if format uses inline element.
 */
export function isInlineMode(key: FormatKey): boolean {
  return key === "inline";
}
