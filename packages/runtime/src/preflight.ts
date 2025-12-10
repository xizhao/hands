/**
 * Preflight checks - verify all dependencies before starting runtime
 */

import { $ } from "bun"

interface PreflightResult {
  ok: boolean
  checks: PreflightCheck[]
}

interface PreflightCheck {
  name: string
  ok: boolean
  message: string
  required: boolean
}

/**
 * Run all preflight checks
 */
export async function runPreflightChecks(): Promise<PreflightResult> {
  const checks: PreflightCheck[] = []

  checks.push(await checkBun())
  checks.push(await checkNode())

  const ok = checks.filter((c) => c.required).every((c) => c.ok)

  return { ok, checks }
}

/**
 * Print preflight results to console
 */
export function printPreflightResults(result: PreflightResult): void {
  console.log("\n=== Preflight Checks ===\n")

  for (const check of result.checks) {
    const status = check.ok
      ? "\x1b[32m✓\x1b[0m"
      : check.required
        ? "\x1b[31m✗\x1b[0m"
        : "\x1b[33m○\x1b[0m"
    const reqLabel = check.required ? "" : " (optional)"
    console.log(`${status} ${check.name}${reqLabel}: ${check.message}`)
  }

  console.log("")

  if (!result.ok) {
    console.error("\x1b[31mPreflight checks failed. Please install missing dependencies.\x1b[0m\n")
  }
}

async function checkBun(): Promise<PreflightCheck> {
  try {
    const result = await $`bun --version`.quiet()
    const version = result.text().trim()
    return {
      name: "Bun",
      ok: true,
      message: `v${version}`,
      required: true,
    }
  } catch {
    return {
      name: "Bun",
      ok: false,
      message: "Not found. Install from https://bun.sh",
      required: true,
    }
  }
}

async function checkNode(): Promise<PreflightCheck> {
  try {
    const result = await $`node --version`.quiet()
    const version = result.text().trim()
    const major = parseInt(version.replace("v", "").split(".")[0], 10)

    if (major < 18) {
      return {
        name: "Node.js",
        ok: false,
        message: `${version} (requires v18+)`,
        required: true,
      }
    }

    return {
      name: "Node.js",
      ok: true,
      message: version,
      required: true,
    }
  } catch {
    return {
      name: "Node.js",
      ok: false,
      message: "Not found. Required for Vite. Install from https://nodejs.org",
      required: true,
    }
  }
}
