/**
 * Block Validation
 *
 * Validates that block files export a valid BlockFn.
 */

import { readFileSync } from "fs"

// Inline type to avoid importing @hands/stdlib at build time
// (importing stdlib triggers a Bun 1.3.3 crash when combined with Bun.build())
interface BlockMeta {
  title?: string
  description?: string
  refreshable?: boolean
  [key: string]: unknown
}

export interface BlockValidationResult {
  /** Whether the block is valid */
  valid: boolean

  /** Error message if invalid */
  error?: string

  /** Extracted metadata */
  meta?: BlockMeta
}

/**
 * Validate a block file
 *
 * Checks that the file:
 * - Has a default export
 * - The default export is a function
 * - Optionally extracts metadata from `export const meta`
 *
 * @param filePath - Path to the block file
 */
export async function validateBlockFile(filePath: string): Promise<BlockValidationResult> {
  try {
    const code = readFileSync(filePath, "utf-8")

    // Quick regex checks for required exports
    // This is faster than full AST parsing for basic validation

    // Check for default export
    const hasDefaultExport =
      /export\s+default\s+/.test(code) ||
      /export\s*{\s*[^}]*\bdefault\b/.test(code)

    if (!hasDefaultExport) {
      return {
        valid: false,
        error: "Missing default export. Blocks must export a default function.",
      }
    }

    // Check that default export looks like a function
    // This catches common cases without full AST parsing
    const defaultExportPatterns = [
      /export\s+default\s+function\s/,           // export default function Foo
      /export\s+default\s+async\s+function\s/,   // export default async function Foo
      /export\s+default\s+\(\s*[\w,\s]*\)\s*=>/,  // export default () =>
      /export\s+default\s+async\s*\(\s*[\w,\s]*\)\s*=>/, // export default async () =>
      /const\s+\w+\s*:\s*BlockFn.*=.*[\s\S]*export\s+default\s+\w+/, // const Foo: BlockFn = ...; export default Foo
    ]

    const looksLikeFunction = defaultExportPatterns.some((pattern) => pattern.test(code))

    if (!looksLikeFunction) {
      // Try to import and check at runtime
      // This handles more complex cases
      try {
        const module = await import(filePath)
        if (typeof module.default !== "function") {
          return {
            valid: false,
            error: "Default export must be a function.",
          }
        }
      } catch (importErr) {
        return {
          valid: false,
          error: `Failed to import block: ${importErr instanceof Error ? importErr.message : String(importErr)}`,
        }
      }
    }

    // Extract metadata if present
    const meta = extractMeta(code)

    return {
      valid: true,
      meta,
    }
  } catch (err) {
    return {
      valid: false,
      error: `Failed to read file: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

/**
 * Extract metadata from block file
 */
function extractMeta(code: string): BlockMeta | undefined {
  // Look for: export const meta = { ... }
  const metaMatch = code.match(/export\s+const\s+meta\s*=\s*({[\s\S]*?});/)

  if (!metaMatch) {
    return undefined
  }

  try {
    // Simple extraction of string values
    // For full parsing, we'd need a proper JS parser
    const meta: BlockMeta = {}
    const metaCode = metaMatch[1]

    // Extract title
    const titleMatch = metaCode.match(/title\s*:\s*["']([^"']+)["']/)
    if (titleMatch) {
      meta.title = titleMatch[1]
    }

    // Extract description
    const descMatch = metaCode.match(/description\s*:\s*["']([^"']+)["']/)
    if (descMatch) {
      meta.description = descMatch[1]
    }

    // Extract refreshable
    const refreshMatch = metaCode.match(/refreshable\s*:\s*(true|false)/)
    if (refreshMatch) {
      meta.refreshable = refreshMatch[1] === "true"
    }

    return Object.keys(meta).length > 0 ? meta : undefined
  } catch {
    return undefined
  }
}
