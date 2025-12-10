/**
 * Block Linting
 *
 * Validates block references in pages against available blocks.
 */

import { readdirSync, readFileSync, existsSync } from "fs"
import { join, basename } from "path"

export interface BlockRefError {
  /** Page file where the error occurred */
  page: string
  /** Invalid block src value */
  src: string
  /** Line number (1-indexed) */
  line: number
  /** Available blocks that could be used */
  available: string[]
}

export interface BlockLintResult {
  /** Errors found */
  errors: BlockRefError[]
  /** All available block IDs */
  availableBlocks: string[]
}

/**
 * Lint all pages for invalid block references
 *
 * @param workbookDir - Path to workbook directory
 */
export function lintBlockRefs(workbookDir: string): BlockLintResult {
  const blocksDir = join(workbookDir, "blocks")
  const pagesDir = join(workbookDir, "pages")

  // Discover available blocks
  const availableBlocks = discoverBlockIds(blocksDir)

  // Find all pages
  const errors: BlockRefError[] = []

  if (existsSync(pagesDir)) {
    const pageFiles = readdirSync(pagesDir).filter(
      (f) => f.endsWith(".md") || f.endsWith(".mdx")
    )

    for (const pageFile of pageFiles) {
      const pagePath = join(pagesDir, pageFile)
      const pageErrors = lintPage(pagePath, availableBlocks)
      errors.push(...pageErrors)
    }
  }

  return { errors, availableBlocks }
}

/**
 * Get all block IDs from the blocks directory
 */
function discoverBlockIds(blocksDir: string): string[] {
  if (!existsSync(blocksDir)) {
    return []
  }

  return readdirSync(blocksDir)
    .filter((f) => f.endsWith(".tsx") || f.endsWith(".ts") || f.endsWith(".jsx") || f.endsWith(".js"))
    .map((f) => basename(f).replace(/\.(tsx?|jsx?)$/, ""))
}

/**
 * Lint a single page for invalid block references
 */
function lintPage(pagePath: string, availableBlocks: string[]): BlockRefError[] {
  const errors: BlockRefError[] = []
  const pageFile = basename(pagePath)

  try {
    const content = readFileSync(pagePath, "utf-8")
    const lines = content.split("\n")

    // Match <Block src="..." /> patterns
    const blockPattern = /<Block\s+[^>]*src=["']([^"']+)["'][^>]*\/?>/g

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum]
      let match

      // Reset lastIndex for each line
      blockPattern.lastIndex = 0

      while ((match = blockPattern.exec(line)) !== null) {
        const src = match[1]

        if (!availableBlocks.includes(src)) {
          errors.push({
            page: pageFile,
            src,
            line: lineNum + 1,
            available: availableBlocks,
          })
        }
      }
    }
  } catch (err) {
    // Failed to read file, skip
    console.warn(`[lint] Failed to read ${pagePath}:`, err)
  }

  return errors
}
