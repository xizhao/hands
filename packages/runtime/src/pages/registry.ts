/**
 * Page Registry
 *
 * Maintains a registry of discovered pages for routing.
 */

import type { DiscoveredPage, PageMeta } from "@hands/stdlib"
import { discoverPages, type PageDiscoveryResult } from "./discovery.js"

/**
 * Page registry for runtime use
 */
export class PageRegistry {
  private pages: Map<string, DiscoveredPage> = new Map()
  private pagesDir: string
  private errors: Array<{ file: string; error: string }> = []

  constructor(pagesDir: string) {
    this.pagesDir = pagesDir
  }

  /**
   * Load/reload pages from the directory
   */
  async load(): Promise<PageDiscoveryResult> {
    const result = await discoverPages(this.pagesDir)

    // Clear and repopulate registry
    this.pages.clear()
    this.errors = result.errors

    for (const page of result.pages) {
      this.pages.set(page.route, page)
    }

    return result
  }

  /**
   * Get a page by route
   */
  get(route: string): DiscoveredPage | undefined {
    return this.pages.get(route)
  }

  /**
   * Check if a route exists
   */
  has(route: string): boolean {
    return this.pages.has(route)
  }

  /**
   * Match a route (handles dynamic segments in the future)
   */
  match(path: string): DiscoveredPage | undefined {
    // Normalize path
    const normalizedPath = path === "" ? "/" : path

    // Direct match
    if (this.pages.has(normalizedPath)) {
      return this.pages.get(normalizedPath)
    }

    // Remove trailing slash and try again
    if (normalizedPath.endsWith("/") && normalizedPath !== "/") {
      const withoutSlash = normalizedPath.slice(0, -1)
      if (this.pages.has(withoutSlash)) {
        return this.pages.get(withoutSlash)
      }
    }

    // TODO: Add support for dynamic routes like /docs/[slug]

    return undefined
  }

  /**
   * List all routes
   */
  routes(): string[] {
    return Array.from(this.pages.keys())
  }

  /**
   * List all pages
   */
  list(): DiscoveredPage[] {
    return Array.from(this.pages.values())
  }

  /**
   * Get metadata for navigation
   */
  nav(): Array<{ route: string; title: string; description?: string }> {
    return this.list().map((page) => ({
      route: page.route,
      title: page.meta.title,
      description: page.meta.description,
    }))
  }

  /**
   * Get discovery errors
   */
  getErrors(): Array<{ file: string; error: string }> {
    return this.errors
  }

  /**
   * Get page count
   */
  get size(): number {
    return this.pages.size
  }
}
