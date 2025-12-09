/**
 * Biome formatter integration
 *
 * Uses embedded default config - no biome.json required in workbook
 */

import { spawn } from "bun"
import { existsSync, mkdirSync, writeFileSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

interface FormatResult {
  fixed: string[]
  errors: string[]
}

interface CheckFormatResult {
  needsFormat: string[]
  errors: string[]
}

/**
 * Default biome config (embedded, no file needed in workbook)
 */
const DEFAULT_BIOME_CONFIG = {
  $schema: "https://biomejs.dev/schemas/1.9.4/schema.json",
  formatter: {
    enabled: true,
    indentStyle: "space",
    indentWidth: 2,
    lineWidth: 100,
  },
  javascript: {
    formatter: {
      quoteStyle: "double",
      semicolons: "asNeeded",
      trailingCommas: "es5",
    },
  },
  files: {
    ignore: ["node_modules", "dist", ".hands", "*.d.ts"],
  },
}

// Cached config file path
let cachedConfigPath: string | null = null

/**
 * Get path to embedded biome config (writes to temp dir once per process)
 */
function getConfigPath(): string {
  if (cachedConfigPath && existsSync(cachedConfigPath)) {
    return cachedConfigPath
  }

  const configDir = join(tmpdir(), "hands-biome")
  mkdirSync(configDir, { recursive: true })

  const configPath = join(configDir, "biome.json")
  writeFileSync(configPath, JSON.stringify(DEFAULT_BIOME_CONFIG, null, 2))

  cachedConfigPath = configPath
  return configPath
}

/**
 * Run biome format with auto-fix
 */
export async function formatCode(workbookDir: string): Promise<FormatResult> {
  const srcDir = join(workbookDir, "src")

  if (!existsSync(srcDir)) {
    return { fixed: [], errors: ["src/ directory not found"] }
  }

  const configPath = getConfigPath()

  // Run biome format with write mode and our embedded config
  const proc = spawn(
    ["bunx", "@biomejs/biome", "format", "--write", "--config-path", configPath, srcDir],
    {
      cwd: workbookDir,
      stdout: "pipe",
      stderr: "pipe",
    }
  )

  const stdout = await new Response(proc.stdout).text()
  const stderr = await new Response(proc.stderr).text()
  const exitCode = await proc.exited

  const fixed: string[] = []
  const errors: string[] = []

  // Parse biome output
  // Biome outputs "Formatted X file(s)" on success
  // and file-by-file info for changes

  const output = stdout + stderr

  // Match formatted files
  const formattedPattern = /Formatted:\s*(.+)/g
  let match
  while ((match = formattedPattern.exec(output)) !== null) {
    fixed.push(match[1].trim())
  }

  // Check for errors
  if (exitCode !== 0 && !output.includes("Formatted")) {
    // Parse error output
    const lines = output.split("\n").filter(Boolean)
    for (const line of lines) {
      if (line.includes("error") || line.includes("Error")) {
        errors.push(line)
      }
    }

    if (errors.length === 0 && output.trim()) {
      errors.push(output.trim().slice(0, 200))
    }
  }

  return { fixed, errors }
}

/**
 * Check formatting without fixing
 */
export async function checkFormat(workbookDir: string): Promise<CheckFormatResult> {
  const srcDir = join(workbookDir, "src")

  if (!existsSync(srcDir)) {
    return { needsFormat: [], errors: ["src/ directory not found"] }
  }

  const configPath = getConfigPath()

  const proc = spawn(
    ["bunx", "@biomejs/biome", "format", "--check", "--config-path", configPath, srcDir],
    {
      cwd: workbookDir,
      stdout: "pipe",
      stderr: "pipe",
    }
  )

  const stdout = await new Response(proc.stdout).text()
  await proc.exited

  const needsFormat: string[] = []
  const errors: string[] = []

  // Parse files that need formatting
  const unformattedPattern = /Would format:\s*(.+)/g
  let match
  while ((match = unformattedPattern.exec(stdout)) !== null) {
    needsFormat.push(match[1].trim())
  }

  return { needsFormat, errors }
}
