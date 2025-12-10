/**
 * Hands Diagnostics Plugin
 *
 * Uses the hands CLI to check for errors in the project.
 */

import type { Plugin, ToolContext } from "@opencode-ai/plugin"
import { tool } from "@opencode-ai/plugin"

const z = tool.schema

export default (async (ctx) => {
  const { $ } = ctx

  // Tool: Run hands build checks
  const check = tool({
    description:
      "Run code quality checks on a Hands workbook (TypeScript, formatting, linting). Returns JSON with any errors found.",
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
      const dir = args.workbookDir || process.cwd()
      const strictFlag = args.strict ? "--strict" : ""

      try {
        const result = await $`cd ${dir} && hands build --json --no-fix ${strictFlag} 2>&1`.quiet()
        return result.stdout || "No issues found"
      } catch (e: any) {
        // hands build exits non-zero when issues found, but still outputs JSON
        return e.stdout || e.stderr || "Check failed"
      }
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
          return JSON.stringify(data, null, 2)
        }
        return JSON.stringify({
          error: "Runtime not responding - is hands dev running?",
        })
      } catch (e) {
        return JSON.stringify({
          error: e instanceof Error ? e.message : "Unknown error",
        })
      }
    },
  })

  return {
    tool: {
      hands_check: check,
      hands_status: status,
    },
  }
}) satisfies Plugin
