/**
 * Page Discovery
 *
 * Discovers pages in a workbook's pages directory.
 * Pages are markdown or plate documents that can contain blocks.
 *
 * Structure:
 * - pages/*.mdx → Pages (routable documents, shown in nav)
 * - pages/blocks/*.mdx → Blocks (embeddable fragments, shown in BlocksPanel)
 */

import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/** Subdirectory containing reusable blocks */
export const BLOCKS_SUBDIR = "blocks";

export interface DiscoveredPage {
  /** Route path (e.g., "/", "/about", "/docs/intro") */
  route: string;
  /** Relative path to page file */
  path: string;
  /** File extension */
  ext: string;
  /** Whether this is a block (in blocks/ subdirectory) */
  isBlock: boolean;
}

export interface DiscoverPagesResult {
  pages: DiscoveredPage[];
  errors: Array<{ file: string; error: string }>;
}

const PAGE_EXTENSIONS = [".md", ".mdx", ".plate.json"];

/**
 * Ensure the blocks/ subdirectory exists
 */
export function ensureBlocksDir(pagesDir: string): void {
  const blocksDir = join(pagesDir, BLOCKS_SUBDIR);
  if (!existsSync(blocksDir)) {
    mkdirSync(blocksDir, { recursive: true });
  }
}

/**
 * Check if a path is inside the blocks/ subdirectory
 */
function isBlockPath(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, "/");
  return normalized.startsWith(`${BLOCKS_SUBDIR}/`) || normalized === BLOCKS_SUBDIR;
}

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
                isBlock: isBlockPath(relativePath),
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
 * Discover only pages (excluding blocks/)
 */
export async function discoverPagesOnly(pagesDir: string): Promise<DiscoverPagesResult> {
  const result = await discoverPages(pagesDir);
  return {
    pages: result.pages.filter((p) => !p.isBlock),
    errors: result.errors,
  };
}

/**
 * Discover only blocks (from blocks/ subdirectory)
 */
export async function discoverBlocks(pagesDir: string): Promise<DiscoverPagesResult> {
  const result = await discoverPages(pagesDir);
  return {
    pages: result.pages.filter((p) => p.isBlock),
    errors: result.errors,
  };
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
