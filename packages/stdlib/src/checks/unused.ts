/**
 * Knip integration for detecting unused code
 */

import { spawn } from "bun"
import { existsSync } from "fs"
import { join } from "path"

interface UnusedResult {
  exports: string[]
  files: string[]
}

// Patterns to ignore in knip results (wrangler temp files, build artifacts, etc.)
const IGNORE_PATTERNS = [
  ".wrangler/",
  ".hands/",
  "node_modules/",
  "dist/",
  "build/",
]

function shouldIgnore(path: string): boolean {
  return IGNORE_PATTERNS.some(pattern => path.includes(pattern))
}

/**
 * Run knip to detect unused exports and files
 */
export async function findUnused(workbookDir: string): Promise<UnusedResult> {
  // Check if package.json exists
  if (!existsSync(join(workbookDir, "package.json"))) {
    return { exports: [], files: [] }
  }

  const proc = spawn(
    [
      "bunx", "knip",
      "--reporter", "json",
      "--ignore", ".wrangler/**",
      "--ignore", ".hands/**",
    ],
    {
      cwd: workbookDir,
      stdout: "pipe",
      stderr: "pipe",
    }
  )

  const stdout = await new Response(proc.stdout).text()
  await proc.exited

  const exports: string[] = []
  const files: string[] = []

  try {
    if (!stdout.trim()) {
      return { exports, files }
    }

    const result = JSON.parse(stdout)

    // Parse knip JSON output
    // Structure: { files: [...], exports: { file: [...] }, ... }

    if (result.files && Array.isArray(result.files)) {
      for (const file of result.files) {
        if (!shouldIgnore(file)) {
          files.push(file)
        }
      }
    }

    if (result.exports && typeof result.exports === "object") {
      for (const [file, unused] of Object.entries(result.exports)) {
        if (shouldIgnore(file)) continue
        if (Array.isArray(unused)) {
          for (const exp of unused) {
            exports.push(`${file}:${exp}`)
          }
        }
      }
    }

    // Also check unlisted dependencies
    if (result.unlisted && typeof result.unlisted === "object") {
      for (const [file, deps] of Object.entries(result.unlisted)) {
        if (shouldIgnore(file)) continue
        if (Array.isArray(deps)) {
          for (const dep of deps) {
            exports.push(`${file}: unlisted dependency '${dep}'`)
          }
        }
      }
    }
  } catch {
    // Knip may output non-JSON on certain errors
    // In that case, just return empty results
  }

  return { exports, files }
}
