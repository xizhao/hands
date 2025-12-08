/**
 * Code quality checks for Hands workbooks
 *
 * Runs TypeScript, Biome formatting, and Knip unused detection
 */

import { checkTypescript } from "./typescript.js"
import { formatCode, checkFormat } from "./format.js"
import { findUnused } from "./unused.js"

export interface Diagnostic {
  file: string
  line: number
  column: number
  message: string
  code?: string
  severity: "error" | "warning"
}

export interface CheckResult {
  typescript: {
    errors: Diagnostic[]
    warnings: Diagnostic[]
  }
  format: {
    fixed: string[]
    errors: string[]
  }
  unused: {
    exports: string[]
    files: string[]
  }
}

export interface CheckOptions {
  /** Auto-fix formatting issues (default: true) */
  fix?: boolean
  /** Run checks in parallel (default: true) */
  parallel?: boolean
}

/**
 * Run all code quality checks on a workbook
 */
export async function runChecks(
  workbookDir: string,
  options: CheckOptions = {}
): Promise<CheckResult> {
  const { fix = true, parallel = true } = options

  if (parallel) {
    const [typescript, format, unused] = await Promise.all([
      checkTypescript(workbookDir),
      fix ? formatCode(workbookDir) : checkFormat(workbookDir).then(r => ({
        fixed: [],
        errors: r.needsFormat.length > 0
          ? [`${r.needsFormat.length} files need formatting`]
          : r.errors,
      })),
      findUnused(workbookDir),
    ])

    return { typescript, format, unused }
  }

  // Sequential execution
  const typescript = await checkTypescript(workbookDir)
  const format = fix
    ? await formatCode(workbookDir)
    : await checkFormat(workbookDir).then(r => ({
        fixed: [],
        errors: r.needsFormat.length > 0
          ? [`${r.needsFormat.length} files need formatting`]
          : r.errors,
      }))
  const unused = await findUnused(workbookDir)

  return { typescript, format, unused }
}

/**
 * Check if there are any errors in the check result
 */
export function hasErrors(result: CheckResult): boolean {
  return (
    result.typescript.errors.length > 0 ||
    result.format.errors.length > 0
  )
}

/**
 * Get a summary string of the check result
 */
export function summarizeChecks(result: CheckResult): string {
  const lines: string[] = []

  // TypeScript
  const tsErrors = result.typescript.errors.length
  const tsWarnings = result.typescript.warnings.length
  if (tsErrors > 0 || tsWarnings > 0) {
    lines.push(`TypeScript: ${tsErrors} errors, ${tsWarnings} warnings`)
  } else {
    lines.push("TypeScript: OK")
  }

  // Format
  if (result.format.errors.length > 0) {
    lines.push(`Format: ${result.format.errors.length} errors`)
  } else if (result.format.fixed.length > 0) {
    lines.push(`Format: Fixed ${result.format.fixed.length} files`)
  } else {
    lines.push("Format: OK")
  }

  // Unused
  const unusedCount = result.unused.exports.length + result.unused.files.length
  if (unusedCount > 0) {
    lines.push(`Unused: ${result.unused.exports.length} exports, ${result.unused.files.length} files`)
  } else {
    lines.push("Unused: OK")
  }

  return lines.join("\n")
}

export { checkTypescript } from "./typescript.js"
export { formatCode, checkFormat } from "./format.js"
export { findUnused } from "./unused.js"
