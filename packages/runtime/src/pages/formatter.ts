/**
 * Page Formatter
 *
 * Auto-formats page files to ensure they:
 * 1. Use .mdx extension (not .md)
 * 2. Have valid frontmatter with at least a title
 * 3. Follow consistent structure
 */

import { readdir, readFile, writeFile, rename, stat } from "fs/promises"
import { join, basename, dirname, extname } from "path"
import { existsSync } from "fs"

export interface FormatResult {
  renamed: string[]
  updated: string[]
  errors: Array<{ file: string; error: string }>
}

/**
 * Format all pages in the pages/ directory
 */
export async function formatPages(pagesDir: string): Promise<FormatResult> {
  const result: FormatResult = {
    renamed: [],
    updated: [],
    errors: [],
  }

  if (!existsSync(pagesDir)) {
    return result
  }

  const files = await findAllFiles(pagesDir)

  for (const file of files) {
    const fullPath = join(pagesDir, file)

    try {
      // Handle .md -> .mdx rename
      if (file.endsWith(".md") && !file.endsWith(".mdx")) {
        const newPath = fullPath.replace(/\.md$/, ".mdx")
        await rename(fullPath, newPath)
        result.renamed.push(`${file} -> ${file.replace(/\.md$/, ".mdx")}`)

        // Update the file reference for frontmatter check
        const newFile = file.replace(/\.md$/, ".mdx")
        await ensureFrontmatter(join(pagesDir, newFile), newFile, result)
      } else if (file.endsWith(".mdx")) {
        await ensureFrontmatter(fullPath, file, result)
      }
    } catch (err) {
      result.errors.push({
        file,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return result
}

/**
 * Format a single page file
 */
export async function formatPage(
  pagesDir: string,
  relativePath: string
): Promise<FormatResult> {
  const result: FormatResult = {
    renamed: [],
    updated: [],
    errors: [],
  }

  const fullPath = join(pagesDir, relativePath)

  if (!existsSync(fullPath)) {
    return result
  }

  try {
    // Handle .md -> .mdx rename
    if (relativePath.endsWith(".md") && !relativePath.endsWith(".mdx")) {
      const newPath = fullPath.replace(/\.md$/, ".mdx")
      await rename(fullPath, newPath)
      result.renamed.push(
        `${relativePath} -> ${relativePath.replace(/\.md$/, ".mdx")}`
      )

      const newRelativePath = relativePath.replace(/\.md$/, ".mdx")
      await ensureFrontmatter(
        join(pagesDir, newRelativePath),
        newRelativePath,
        result
      )
    } else if (relativePath.endsWith(".mdx")) {
      await ensureFrontmatter(fullPath, relativePath, result)
    }
  } catch (err) {
    result.errors.push({
      file: relativePath,
      error: err instanceof Error ? err.message : String(err),
    })
  }

  return result
}

/**
 * Ensure a file has valid frontmatter
 */
async function ensureFrontmatter(
  fullPath: string,
  relativePath: string,
  result: FormatResult
): Promise<void> {
  const content = await readFile(fullPath, "utf-8")

  // Check if it already has frontmatter
  if (content.startsWith("---")) {
    const endIndex = content.indexOf("---", 3)
    if (endIndex !== -1) {
      // Has frontmatter - check if it has a title
      const frontmatter = content.slice(3, endIndex).trim()
      if (frontmatter.includes("title:")) {
        return // Already has valid frontmatter with title
      }

      // Has frontmatter but no title - add one
      const title = inferTitle(relativePath)
      const newFrontmatter = `title: "${title}"\n${frontmatter}`
      const newContent = `---\n${newFrontmatter}\n---${content.slice(endIndex + 3)}`
      await writeFile(fullPath, newContent, "utf-8")
      result.updated.push(`${relativePath} (added title)`)
      return
    }
  }

  // No frontmatter - add it
  const title = inferTitle(relativePath)
  const newContent = `---\ntitle: "${title}"\n---\n\n${content}`
  await writeFile(fullPath, newContent, "utf-8")
  result.updated.push(`${relativePath} (added frontmatter)`)
}

/**
 * Infer a title from the file path
 */
function inferTitle(relativePath: string): string {
  // Remove extension
  let name = basename(relativePath)
  if (name.endsWith(".mdx")) {
    name = name.slice(0, -4)
  } else if (name.endsWith(".md")) {
    name = name.slice(0, -3)
  }

  // Handle index files
  if (name === "index") {
    const dir = dirname(relativePath)
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
 * Find all page files recursively
 */
async function findAllFiles(dir: string, prefix = ""): Promise<string[]> {
  const files: string[] = []
  const entries = await readdir(dir, { withFileTypes: true })

  for (const entry of entries) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name

    if (entry.isDirectory()) {
      const subFiles = await findAllFiles(join(dir, entry.name), relativePath)
      files.push(...subFiles)
    } else if (entry.name.endsWith(".md") || entry.name.endsWith(".mdx")) {
      files.push(relativePath)
    }
  }

  return files
}
