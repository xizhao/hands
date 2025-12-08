import { existsSync } from "fs"
import { mkdir, copyFile } from "fs/promises"
import { join, dirname } from "path"
import { loadHandsJson, saveHandsJson } from "../build/schema.js"
import { registry } from "../sources/index.js"

export interface AddSourceOptions {
  /** Workbook directory (default: cwd) */
  workbookDir?: string
  /** Cron schedule override */
  schedule?: string
  /** Skip updating hands.json */
  skipConfig?: boolean
}

export interface AddSourceResult {
  success: boolean
  filesCreated: string[]
  errors: string[]
  nextSteps: string[]
}

/**
 * Add a source from the registry to a workbook
 *
 * This copies the source files and updates hands.json
 */
export async function addSource(
  sourceName: string,
  options: AddSourceOptions = {}
): Promise<AddSourceResult> {
  const workbookDir = options.workbookDir ?? process.cwd()
  const errors: string[] = []
  const filesCreated: string[] = []
  const nextSteps: string[] = []

  // Find source in registry
  const registryItem = registry.items.find((i) => i.name === sourceName)
  if (!registryItem) {
    const available = registry.items.map((i) => i.name).join(", ")
    return {
      success: false,
      filesCreated: [],
      errors: [`Source "${sourceName}" not found. Available: ${available}`],
      nextSteps: [],
    }
  }

  // Get the stdlib package path (where source files live)
  // In development, this is relative to this file
  // In production (npm), it would be in node_modules
  const stdlibPath = getStdlibPath()

  // Copy each file from registry
  for (const file of registryItem.files) {
    const sourcePath = join(stdlibPath, "src/sources", file.path)
    const targetPath = join(workbookDir, file.target)

    try {
      // Check if source file exists
      if (!existsSync(sourcePath)) {
        errors.push(`Source file not found: ${sourcePath}`)
        continue
      }

      // Create target directory
      await mkdir(dirname(targetPath), { recursive: true })

      // Check if target already exists
      if (existsSync(targetPath)) {
        console.log(`Skipping (exists): ${file.target}`)
        continue
      }

      // Copy file
      await copyFile(sourcePath, targetPath)
      filesCreated.push(file.target)
      console.log(`Created: ${file.target}`)
    } catch (error) {
      errors.push(`Failed to copy ${file.path}: ${error}`)
    }
  }

  // Update hands.json
  if (!options.skipConfig) {
    try {
      const config = await loadHandsJson(workbookDir)

      // Add source if not already present
      if (!config.sources[sourceName]) {
        config.sources[sourceName] = {
          enabled: true,
          schedule: options.schedule ?? registryItem.schedule,
          options: {},
        }

        // Add required secrets
        for (const secret of registryItem.secrets) {
          if (!config.secrets[secret]) {
            config.secrets[secret] = {
              required: true,
              description: `Required by ${sourceName} source`,
            }
          }
        }

        await saveHandsJson(workbookDir, config)
        console.log("Updated: hands.json")
      }
    } catch (error) {
      errors.push(`Failed to update hands.json: ${error}`)
    }
  }

  // Build next steps
  if (registryItem.secrets.length > 0) {
    nextSteps.push(`Set required secrets:`)
    for (const secret of registryItem.secrets) {
      nextSteps.push(`  export ${secret}=<your-value>`)
    }
  }

  if (registryItem.tables && registryItem.tables.length > 0) {
    nextSteps.push(`Run migrations to create tables:`)
    nextSteps.push(`  hands migrate`)
  }

  nextSteps.push(`Rebuild to include source:`)
  nextSteps.push(`  hands build`)

  return {
    success: errors.length === 0,
    filesCreated,
    errors,
    nextSteps,
  }
}

/**
 * List available sources from the registry
 */
export function listSources(): Array<{
  name: string
  title: string
  description: string
  secrets: string[]
  streams: string[]
}> {
  return registry.items.map((item) => ({
    name: item.name,
    title: item.title,
    description: item.description,
    secrets: item.secrets,
    streams: item.streams,
  }))
}

/**
 * Get the path to the stdlib package
 */
function getStdlibPath(): string {
  // In development, we're running from packages/stdlib/src/cli/
  // Go up to packages/stdlib/
  const thisFile = import.meta.path
  const srcDir = dirname(dirname(thisFile)) // src/
  const stdlibDir = dirname(srcDir) // stdlib/

  // Check if we're in a typical development structure
  if (existsSync(join(stdlibDir, "src/sources/registry"))) {
    return stdlibDir
  }

  // Try node_modules path
  const nodeModulesPath = join(process.cwd(), "node_modules/@hands/stdlib")
  if (existsSync(nodeModulesPath)) {
    return nodeModulesPath
  }

  // Fall back to relative path from cwd
  return stdlibDir
}
