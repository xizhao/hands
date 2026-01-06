/**
 * Route Types - Shared route type definitions
 *
 * Centralized route types used across navigation components.
 */

/**
 * Valid route types for navigation
 */
export type RouteType = "page" | "table" | "action";

/**
 * Route configuration for building paths
 */
export interface RouteConfig {
  path: string;
  param: string;
}

/**
 * Route configurations for each route type
 */
export const ROUTE_CONFIGS: Record<RouteType, RouteConfig> = {
  page: { path: "/pages/$pageId", param: "pageId" },
  table: { path: "/tables/$tableId", param: "tableId" },
  action: { path: "/actions/$actionId", param: "actionId" },
};

/**
 * Route prefixes for building URLs
 */
export const ROUTE_PREFIXES: Record<RouteType, string> = {
  page: "/pages",
  table: "/tables",
  action: "/actions",
};

/**
 * Normalize a page ID by stripping .mdx extension and /index suffix
 */
export function normalizePageId(id: string): string {
  return id.replace(/\.mdx$/, "").replace(/\/index$/, "");
}

/**
 * Extract page ID from a file path
 */
export function getPageIdFromPath(path: string): string {
  return normalizePageId(path);
}

/**
 * Normalize an ID based on route type
 * Pages need .mdx extension stripped, others are passed through
 */
export function normalizeRouteId(routeType: RouteType, id: string): string {
  if (routeType === "page") {
    return normalizePageId(id);
  }
  return id;
}
