/**
 * Page Registry
 *
 * Maintains a registry of discovered pages for routing.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { discoverPages, type DiscoveredPage } from "./discovery.js";
import { compilePage, type CompiledPage } from "./mdx.js";

// ============================================================================
// Types
// ============================================================================

export interface PageRegistryOptions {
  /** Path to the pages directory */
  pagesDir: string;

  /** Whether to pre-compile pages on load */
  precompile?: boolean;
}

export interface RegisteredPage extends DiscoveredPage {
  /** Pre-compiled page data (if precompile enabled) */
  compiled?: CompiledPage;
}

// ============================================================================
// Page Registry Class
// ============================================================================

/**
 * Page registry for runtime use
 */
export class PageRegistry {
  private pages: Map<string, RegisteredPage> = new Map();
  private pagesDir: string;
  private errors: Array<{ file: string; error: string }> = [];
  private precompile: boolean;

  constructor(options: PageRegistryOptions) {
    this.pagesDir = options.pagesDir;
    this.precompile = options.precompile ?? false;
  }

  /**
   * Load/reload pages from the directory
   */
  async load(): Promise<{
    pages: RegisteredPage[];
    errors: Array<{ file: string; error: string }>;
  }> {
    const result = await discoverPages(this.pagesDir);

    // Clear and repopulate registry
    this.pages.clear();
    this.errors = [...result.errors];

    for (const page of result.pages) {
      const registered: RegisteredPage = { ...page };

      // Pre-compile if enabled
      if (this.precompile) {
        try {
          const source = await readFile(join(this.pagesDir, page.path), "utf-8");
          registered.compiled = compilePage(source);

          if (registered.compiled.errors.length > 0) {
            this.errors.push({
              file: page.path,
              error: registered.compiled.errors.join("; "),
            });
          }
        } catch (err) {
          this.errors.push({
            file: page.path,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      this.pages.set(page.route, registered);
    }

    return {
      pages: Array.from(this.pages.values()),
      errors: this.errors,
    };
  }

  /**
   * Get a page by route
   */
  get(route: string): RegisteredPage | undefined {
    return this.pages.get(route);
  }

  /**
   * Check if a route exists
   */
  has(route: string): boolean {
    return this.pages.has(route);
  }

  /**
   * Match a route (handles trailing slashes)
   */
  match(path: string): RegisteredPage | undefined {
    // Normalize path
    const normalizedPath = path === "" ? "/" : path;

    // Direct match
    if (this.pages.has(normalizedPath)) {
      return this.pages.get(normalizedPath);
    }

    // Remove trailing slash and try again
    if (normalizedPath.endsWith("/") && normalizedPath !== "/") {
      const withoutSlash = normalizedPath.slice(0, -1);
      if (this.pages.has(withoutSlash)) {
        return this.pages.get(withoutSlash);
      }
    }

    // Add trailing slash and try
    if (!normalizedPath.endsWith("/")) {
      const withSlash = normalizedPath + "/";
      if (this.pages.has(withSlash)) {
        return this.pages.get(withSlash);
      }
    }

    return undefined;
  }

  /**
   * List all routes
   */
  routes(): string[] {
    return Array.from(this.pages.keys());
  }

  /**
   * List all pages
   */
  list(): RegisteredPage[] {
    return Array.from(this.pages.values());
  }

  /**
   * Get any errors from loading
   */
  getErrors(): Array<{ file: string; error: string }> {
    return this.errors;
  }

  /**
   * Get the pages directory path
   */
  getPagesDir(): string {
    return this.pagesDir;
  }

  /**
   * Invalidate a specific page (force recompile on next access)
   */
  invalidate(route: string): void {
    const page = this.pages.get(route);
    if (page) {
      delete page.compiled;
    }
  }

  /**
   * Invalidate all pages
   */
  invalidateAll(): void {
    for (const page of this.pages.values()) {
      delete page.compiled;
    }
  }

  /**
   * Get page source (read from file)
   */
  async getSource(route: string): Promise<string | null> {
    const page = this.pages.get(route);
    if (!page) return null;

    try {
      return await readFile(join(this.pagesDir, page.path), "utf-8");
    } catch {
      return null;
    }
  }

  /**
   * Get compiled page (compile on demand if not cached)
   */
  async getCompiled(route: string): Promise<CompiledPage | null> {
    const page = this.pages.get(route);
    if (!page) return null;

    // Return cached if available
    if (page.compiled) {
      return page.compiled;
    }

    // Compile on demand
    try {
      const source = await readFile(join(this.pagesDir, page.path), "utf-8");
      page.compiled = compilePage(source);
      return page.compiled;
    } catch {
      return null;
    }
  }
}

/**
 * Create a page registry
 */
export function createPageRegistry(options: PageRegistryOptions): PageRegistry {
  return new PageRegistry(options);
}
