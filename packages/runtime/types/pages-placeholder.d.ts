/**
 * Placeholder types for @hands/pages
 * At runtime, Vite resolves this to the workbook's generated pages/index.tsx
 */

import type { RouteType } from "rwsdk/router";

// Page metadata
export interface PageMeta {
  frontmatter: Record<string, unknown>;
}

// Dynamic pages object - actual pages generated per-workbook
export declare const pages: Record<string, PageMeta>;

// Page ID type
export type PageId = string;

// Routes array for rwsdk render()
export declare const pageRoutes: readonly RouteType[];
