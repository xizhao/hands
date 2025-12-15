/**
 * Page Discovery
 *
 * Discovers pages in a workbook's pages directory.
 * Pages are markdown or plate documents that can contain blocks.
 */

import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export interface DiscoveredPage {
  /** Route path (e.g., "/", "/about", "/docs/intro") */
  route: string;
  /** Relative path to page file */
  path: string;
  /** File extension */
  ext: string;
}

export interface DiscoverPagesResult {
  pages: DiscoveredPage[];
  errors: Array<{ file: string; error: string }>;
}

const PAGE_EXTENSIONS = [".md", ".mdx", ".plate.json"];

/**
 * Discover pages in a directory
 */
export async function discoverPages(pagesDir: string): Promise<DiscoverPagesResult> {
  const pages: DiscoveredPage[] = [];
  const errors: Array<{ file: string; error: string }> = [];

  if (!existsSync(pagesDir)) {
    return { pages, errors };
  }

  function scanDir(dir: string, basePath: string = ""): void {
    try {
      const entries = readdirSync(dir);
      for (const entry of entries) {
        const fullPath = join(dir, entry);
        const relativePath = join(basePath, entry);

        try {
          const stat = statSync(fullPath);

          if (stat.isDirectory()) {
            scanDir(fullPath, relativePath);
          } else {
            const ext = getPageExtension(entry);
            if (ext) {
              const route = pathToRoute(relativePath, ext);
              pages.push({
                route,
                path: relativePath,
                ext,
              });
            }
          }
        } catch (err) {
          errors.push({
            file: relativePath,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    } catch (err) {
      errors.push({
        file: dir,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  scanDir(pagesDir);
  return { pages, errors };
}

/**
 * Get page extension if valid page file
 */
function getPageExtension(filename: string): string | null {
  for (const ext of PAGE_EXTENSIONS) {
    if (filename.endsWith(ext)) {
      return ext;
    }
  }
  return null;
}

/**
 * Convert file path to route
 */
function pathToRoute(path: string, ext: string): string {
  // Remove extension
  let route = path.slice(0, -ext.length);

  // Handle index files
  if (route.endsWith("/index") || route === "index") {
    route = route.slice(0, -5) || "/";
  }

  // Ensure leading slash
  if (!route.startsWith("/")) {
    route = `/${route}`;
  }

  // Normalize slashes
  route = route.replace(/\\/g, "/");

  return route || "/";
}
