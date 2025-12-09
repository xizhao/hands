/**
 * Page Discovery
 *
 * Scans the pages/ directory to find all markdown files.
 */

import { existsSync } from "fs"
import { readdir, readFile } from "fs/promises"
import { join, basename, dirname } from "path"

// Inline types to avoid stdlib dependency for build-time code
export interface PageMeta {
  title: string
  description?: string
  [key: string]: unknown
}

export interface DiscoveredPage {
  route: string
  path: string
  meta: PageMeta
}

export interface PageDiscoveryResult {
  /** Successfully discovered pages */
  pages: DiscoveredPage[]

  /** Errors encountered during discovery */
  errors: Array<{
    file: string
    error: string
  }>
}

/**
 * Discover pages in a directory
 *
 * Scans the pages/ directory for .md files, extracts frontmatter,
 * and returns a list of discovered pages with their routes.
 *
 * @param pagesDir - Path to the pages directory
 */
export async function discoverPages(pagesDir: string): Promise<PageDiscoveryResult> {
  const pages: DiscoveredPage[] = []
  const errors: Array<{ file: string; error: string }> = []

  // Check if directory exists
  if (!existsSync(pagesDir)) {
    return { pages, errors }
  }

  // Find all .md files recursively
  const files = await findMarkdownFiles(pagesDir)

  for (const file of files) {
    const filePath = join(pagesDir, file)

    try {
      // Read file and extract frontmatter
      const content = await readFile(filePath, "utf-8")
      const meta = extractFrontmatter(content)

      // Convert file path to route
      const route = filePathToRoute(file)

      pages.push({
        route,
        path: file,
        meta: {
          title: meta.title || titleFromPath(file),
          description: meta.description,
          ...meta,
        },
      })
    } catch (err) {
      errors.push({
        file,
        error: `Failed to process: ${err instanceof Error ? err.message : String(err)}`,
      })
    }
  }

  // Sort pages by route (index pages first)
  pages.sort((a, b) => {
    // Root index first
    if (a.route === "/") return -1
    if (b.route === "/") return 1

    // Then by route depth
    const aDepth = a.route.split("/").length
    const bDepth = b.route.split("/").length
    if (aDepth !== bDepth) return aDepth - bDepth

    // Then alphabetically
    return a.route.localeCompare(b.route)
  })

  return { pages, errors }
}

/**
 * Find page files recursively
 * Supports: .md (markdown), .plate.json (Plate documents)
 */
async function findPageFiles(
  dir: string,
  prefix: string = ""
): Promise<string[]> {
  const files: string[] = []
  const entries = await readdir(dir, { withFileTypes: true })

  for (const entry of entries) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name

    if (entry.isDirectory()) {
      // Recurse into subdirectories
      const subFiles = await findPageFiles(
        join(dir, entry.name),
        relativePath
      )
      files.push(...subFiles)
    } else if (entry.name.endsWith(".md") || entry.name.endsWith(".plate.json")) {
      files.push(relativePath)
    }
  }

  return files
}

// Legacy alias for backward compatibility
async function findMarkdownFiles(dir: string, prefix: string = ""): Promise<string[]> {
  return findPageFiles(dir, prefix)
}

/**
 * Convert a file path to a route
 *
 * - index.md -> /
 * - about.md -> /about
 * - docs/intro.md -> /docs/intro
 * - docs/index.md -> /docs
 * - dashboard.plate.json -> /dashboard
 */
function filePathToRoute(filePath: string): string {
  // Remove extension (.md or .plate.json)
  let route = "/" + filePath.replace(/\.(md|plate\.json)$/, "")

  // Handle index files
  if (route.endsWith("/index")) {
    route = route.slice(0, -6) || "/"
  }

  return route
}

/**
 * Generate a title from a file path
 */
function titleFromPath(filePath: string): string {
  // Remove extension
  let name = basename(filePath)
  if (name.endsWith(".plate.json")) {
    name = name.slice(0, -11)
  } else if (name.endsWith(".md")) {
    name = name.slice(0, -3)
  }

  if (name === "index") {
    const dir = dirname(filePath)
    return dir === "." ? "Home" : titleCase(basename(dir))
  }
  return titleCase(name)
}

/**
 * Convert a string to title case
 */
function titleCase(str: string): string {
  return str
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

/**
 * Extract frontmatter from markdown content
 */
function extractFrontmatter(content: string): Record<string, unknown> {
  // Check for YAML frontmatter
  if (!content.startsWith("---")) {
    return {}
  }

  const endIndex = content.indexOf("---", 3)
  if (endIndex === -1) {
    return {}
  }

  const frontmatter = content.slice(3, endIndex).trim()

  // Parse simple YAML (key: value pairs)
  const meta: Record<string, unknown> = {}

  for (const line of frontmatter.split("\n")) {
    const colonIndex = line.indexOf(":")
    if (colonIndex === -1) continue

    const key = line.slice(0, colonIndex).trim()
    let value: string | boolean | number = line.slice(colonIndex + 1).trim()

    // Remove quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    // Parse booleans
    if (value === "true") value = true
    else if (value === "false") value = false

    // Parse numbers
    else if (/^-?\d+(\.\d+)?$/.test(value)) {
      value = parseFloat(value)
    }

    meta[key] = value
  }

  return meta
}
