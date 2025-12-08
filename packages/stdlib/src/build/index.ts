import { mkdir } from "fs/promises"
import { join } from "path"
import { loadHandsJson, type HandsJson } from "./schema.js"
import { generateWranglerToml } from "./wrangler.js"
import { generateWorkerEntry } from "./worker.js"

export { loadHandsJson, saveHandsJson, createDefaultHandsJson } from "./schema.js"
export type { HandsJson, SourceConfig, SecretConfig, DatabaseConfig, BuildConfig } from "./schema.js"
export { generateWranglerToml } from "./wrangler.js"
export { generateWorkerEntry } from "./worker.js"

export interface BuildOptions {
  /** Development mode (adds dev settings to wrangler.toml) */
  dev?: boolean
  /** Print verbose output */
  verbose?: boolean
}

export interface BuildResult {
  success: boolean
  outputDir: string
  files: string[]
  errors: string[]
}

/**
 * Build a workbook - generates .hands/ directory from hands.json
 *
 * @param workbookDir - Path to workbook directory containing hands.json
 * @param options - Build options
 * @returns Build result with list of generated files
 */
export async function build(workbookDir: string, options: BuildOptions = {}): Promise<BuildResult> {
  const errors: string[] = []
  const files: string[] = []

  // Load hands.json
  let config: HandsJson
  try {
    config = await loadHandsJson(workbookDir)
  } catch (error) {
    return {
      success: false,
      outputDir: "",
      files: [],
      errors: [error instanceof Error ? error.message : String(error)],
    }
  }

  const outputDir = join(workbookDir, config.build.outDir)

  // Create output directory
  try {
    await mkdir(outputDir, { recursive: true })
  } catch (error) {
    errors.push(`Failed to create output directory: ${error}`)
    return { success: false, outputDir, files, errors }
  }

  // Generate wrangler.toml
  try {
    const wranglerContent = generateWranglerToml(config, { dev: options.dev })
    const wranglerPath = join(outputDir, "wrangler.toml")
    await Bun.write(wranglerPath, wranglerContent)
    files.push("wrangler.toml")

    if (options.verbose) {
      console.log(`Generated: ${wranglerPath}`)
    }
  } catch (error) {
    errors.push(`Failed to generate wrangler.toml: ${error}`)
  }

  // Generate worker.ts
  try {
    const workerContent = generateWorkerEntry(config)
    const workerPath = join(outputDir, "worker.ts")
    await Bun.write(workerPath, workerContent)
    files.push("worker.ts")

    if (options.verbose) {
      console.log(`Generated: ${workerPath}`)
    }
  } catch (error) {
    errors.push(`Failed to generate worker.ts: ${error}`)
  }

  // Generate .gitignore in output dir
  try {
    const gitignorePath = join(outputDir, ".gitignore")
    await Bun.write(gitignorePath, "# Auto-generated - do not commit\n*\n")
    files.push(".gitignore")
  } catch (error) {
    // Non-fatal
    if (options.verbose) {
      console.warn(`Warning: Could not create .gitignore: ${error}`)
    }
  }

  return {
    success: errors.length === 0,
    outputDir,
    files,
    errors,
  }
}

/**
 * Check if a build is needed (hands.json or sources changed)
 */
export async function needsBuild(workbookDir: string): Promise<boolean> {
  try {
    const config = await loadHandsJson(workbookDir)
    const outputDir = join(workbookDir, config.build.outDir)

    // Check if output files exist
    const wranglerPath = join(outputDir, "wrangler.toml")
    const workerPath = join(outputDir, "worker.ts")

    const wranglerFile = Bun.file(wranglerPath)
    const workerFile = Bun.file(workerPath)

    if (!(await wranglerFile.exists()) || !(await workerFile.exists())) {
      return true
    }

    // Check if hands.json is newer than output files
    const handsJsonPath = join(workbookDir, "hands.json")
    const handsJsonFile = Bun.file(handsJsonPath)

    const handsJsonStat = await handsJsonFile.stat()
    const wranglerStat = await wranglerFile.stat()

    if (handsJsonStat && wranglerStat) {
      if (handsJsonStat.mtime > wranglerStat.mtime) {
        return true
      }
    }

    // TODO: Also check if sources/ files are newer

    return false
  } catch {
    // If anything fails, assume we need a build
    return true
  }
}
