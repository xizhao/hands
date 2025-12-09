/**
 * Stdlib Blocks - Server-rendered components for workbook editor
 *
 * These blocks are rendered by the worker and displayed in the Plate editor.
 * Each block can fetch data from PostgreSQL and render server-side.
 */

export { SqlBlock, type SqlBlockProps } from "./SqlBlock.js";
export { ChartBlock, type ChartBlockProps, type ChartType } from "./ChartBlock.js";
export { TextBlock, type TextBlockProps } from "./TextBlock.js";
export { TableBlock, type TableBlockProps } from "./TableBlock.js";

// Block registry type
export interface BlockDefinition<T = unknown> {
  id: string;
  type: "sql" | "chart" | "text" | "table";
  props: T;
}

// Common block metadata
export interface BlockMeta {
  title?: string;
  refreshable?: boolean;
}
