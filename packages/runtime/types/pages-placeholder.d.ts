/**
 * Placeholder types for @hands/pages
 * At runtime, Vite resolves this to the workbook's generated pages/index.tsx
 */

import type { RouteType } from "rwsdk/router";
import type { NavPage } from "../src/nav/types";

// Page metadata
export interface PageMeta {
  frontmatter: Record<string, unknown>;
}

// Dynamic pages object - actual pages generated per-workbook
export declare const pages: Record<string, PageMeta>;

// Page ID type
export type PageId = string;

// Navigation-friendly page list for client-side nav widget
export declare const navPages: NavPage[];

// Routes array for rwsdk render()
export declare const pageRoutes: readonly RouteType[];
