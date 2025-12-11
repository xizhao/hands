/**
 * Hands Diagnostics Plugin
 *
 * Auto-injects diagnostics after file writes.
 * Uses the hands CLI to check for errors in the project.
 */

import type { Plugin, ToolContext } from "@opencode-ai/plugin"
import { tool } from "@opencode-ai/plugin"

const z = tool.schema

// Max diagnostics to show before truncating
const MAX_DIAGNOSTICS = 5

// Severity order (most critical first)
const SEVERITY_ORDER: Record<string, number> = {
  error: 0,
  warning: 1,
  info: 2,
  hint: 3,
}

interface Diagnostic {
  file: string
  line?: number
  column?: number
  severity: string
  message: string
  code?: string
}

/**
 * Parse diagnostics from hands build output
 */
function parseDiagnostics(output: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = []

  // Try JSON parse first
  try {
    const json = JSON.parse(output)
    if (json.errors) {
      for (const err of json.errors) {
        diagnostics.push({
          file: err.file || "unknown",
          line: err.line,
          column: err.column,
          severity: err.severity || "error",
          message: err.message,
          code: err.code,
        })
      }
      return diagnostics
    }
  } catch {
    // Not JSON, parse text output
  }

  // Parse TypeScript-style errors: file(line,col): error TS1234: message
  const tsPattern = /^(.+?)\((\d+),(\d+)\):\s*(error|warning)\s*(TS\d+)?:\s*(.+)$/gm
  let match
  while ((match = tsPattern.exec(output)) !== null) {
    diagnostics.push({
      file: match[1],
      line: parseInt(match[2], 10),
      column: parseInt(match[3], 10),
      severity: match[4],
      code: match[5],
      message: match[6],
    })
  }

  // Parse generic error lines
  const genericPattern = /^(error|warning|Error|Warning):\s*(.+)$/gm
  while ((match = genericPattern.exec(output)) !== null) {
    diagnostics.push({
      file: "unknown",
      severity: match[1].toLowerCase(),
      message: match[2],
    })
  }

  return diagnostics
}

/**
 * Sort diagnostics by severity (errors first) then by file
 */
function sortDiagnostics(diagnostics: Diagnostic[]): Diagnostic[] {
  return diagnostics.sort((a, b) => {
    const sevA = SEVERITY_ORDER[a.severity] ?? 99
    const sevB = SEVERITY_ORDER[b.severity] ?? 99
    if (sevA !== sevB) return sevA - sevB
    return a.file.localeCompare(b.file)
  })
}

/**
 * Format diagnostics concisely
 * Format: file:line: message
 */
function formatDiagnostics(diagnostics: Diagnostic[], max: number): string {
  if (diagnostics.length === 0) return ""

  const sorted = sortDiagnostics(diagnostics)
  const shown = sorted.slice(0, max)
  const remaining = sorted.length - shown.length

  const lines = shown.map((d) => {
    const loc = d.line ? `${d.file}:${d.line}` : d.file
    return `${loc}: ${d.message}`
  })

  if (remaining > 0) {
    lines.push(`(${remaining} more errors)`)
  }

  return lines.join("\n")
}

export default (async (ctx) => {
  const { $ } = ctx

  /**
   * Run diagnostics check and return parsed results
   */
  async function runDiagnostics(dir?: string): Promise<Diagnostic[]> {
    const workDir = dir || process.cwd()
    try {
      const result = await $`cd ${workDir} && hands build --json --no-fix 2>&1`.quiet()
      return parseDiagnostics(result.stdout || "")
    } catch (e: any) {
      // hands build exits non-zero when issues found
      return parseDiagnostics(e.stdout || e.stderr || "")
    }
  }

  // Tool: Run hands build checks
  const check = tool({
    description:
      "Run code quality checks on a Hands workbook (TypeScript, formatting, linting). Returns diagnostics sorted by severity.",
    args: {
      workbookDir: z
        .string()
        .optional()
        .describe("Path to workbook directory (defaults to current directory)"),
      strict: z
        .boolean()
        .optional()
        .describe("Exit with error on any issue"),
    },
    async execute(args: { workbookDir?: string; strict?: boolean }, _context: ToolContext) {
      const diagnostics = await runDiagnostics(args.workbookDir)
      if (diagnostics.length === 0) {
        return "No issues found"
      }
      return formatDiagnostics(diagnostics, MAX_DIAGNOSTICS * 2) // Show more when explicitly called
    },
  })

  // Tool: Get runtime status
  const status = tool({
    description:
      "Get the Hands runtime status including service health and TypeScript errors from a running dev server",
    args: {
      port: z
        .number()
        .optional()
        .default(4100)
        .describe("Runtime port (default 4100)"),
    },
    async execute(args: { port?: number }, _context: ToolContext) {
      const port = args.port || 4100
      try {
        const response = await fetch(`http://localhost:${port}/status`)
        if (response.ok) {
          const data = await response.json()
          return `status = "${data.status || "unknown"}"\nruntime_port = ${port}\nhealthy = ${data.healthy ?? true}`
        }
        return `status = "unavailable"\nerror = "Runtime not responding - is hands dev running?"`
      } catch (e) {
        return `status = "error"\nerror = "${e instanceof Error ? e.message : "Unknown error"}"`
      }
    },
  })

  return {
    tool: {
      hands_check: check,
      hands_status: status,
    },

    // Auto-inject diagnostics after file writes
    "tool.execute.after": async (input, output) => {
      // Only run after write/edit tools
      if (input.tool !== "write" && input.tool !== "edit") {
        return
      }

      const diagnostics = await runDiagnostics()
      if (diagnostics.length === 0) {
        return
      }

      // Only show errors (not warnings) in auto-inject to reduce noise
      const errors = diagnostics.filter((d) => d.severity === "error")
      if (errors.length === 0) {
        return
      }

      const formatted = formatDiagnostics(errors, MAX_DIAGNOSTICS)
      output.output += `\n\n<diagnostics>\n${formatted}\n</diagnostics>`
    },
  }
}) satisfies Plugin
