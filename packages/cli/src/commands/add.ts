/**
 * hands add source <name> - Add a source from the registry
 *
 * Copies source files from the registry and updates hands.json.
 */

import { existsSync } from "fs"
import { mkdir, copyFile } from "fs/promises"
import { join, dirname, resolve } from "path"
import { loadHandsJson, saveHandsJson } from "./utils.js"

interface AddOptions {
  schedule?: string
}

export async function addCommand(name: string, options: AddOptions) {
  const workbookDir = process.cwd()

  // Verify this is a workbook directory
  const handsJsonPath = join(workbookDir, "hands.json")
  if (!existsSync(handsJsonPath)) {
    console.error("Error: hands.json not found")
    console.error("Run this command from a workbook directory")
    process.exit(1)
  }

  // Load the source registry
  const registry = await loadRegistry()
  const registryItem = registry.items.find((i) => i.name === name)

  if (!registryItem) {
    console.error(`Error: Source "${name}" not found`)
    console.error()
    console.error("Available sources:")
    for (const item of registry.items) {
      console.error(`  ${item.name.padEnd(15)} ${item.title}`)
    }
    process.exit(1)
  }

  console.log(`Adding source: ${registryItem.title}`)

  // Get the stdlib path (where source files live)
  const stdlibPath = getStdlibPath()
  const filesCreated: string[] = []
  const errors: string[] = []

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
        console.log(`  Skipping (exists): ${file.target}`)
        continue
      }

      // Copy file
      await copyFile(sourcePath, targetPath)
      filesCreated.push(file.target)
      console.log(`  Created: ${file.target}`)
    } catch (error) {
      errors.push(`Failed to copy ${file.path}: ${error}`)
    }
  }

  // Update hands.json
  try {
    const config = await loadHandsJson(workbookDir)

    // Add source if not already present
    if (!config.sources[name]) {
      config.sources[name] = {
        enabled: true,
        schedule: options.schedule ?? registryItem.schedule,
        options: {},
      }

      // Add required secrets
      for (const secret of registryItem.secrets) {
        if (!config.secrets[secret]) {
          config.secrets[secret] = {
            required: true,
            description: `Required by ${name} source`,
          }
        }
      }

      await saveHandsJson(workbookDir, config)
      console.log("  Updated: hands.json")
    }
  } catch (error) {
    errors.push(`Failed to update hands.json: ${error}`)
  }

  // Print errors if any
  if (errors.length > 0) {
    console.error()
    console.error("Errors:")
    for (const error of errors) {
      console.error(`  ${error}`)
    }
    process.exit(1)
  }

  // Print next steps
  console.log()
  console.log("Next steps:")

  if (registryItem.secrets.length > 0) {
    console.log("  Set required secrets:")
    for (const secret of registryItem.secrets) {
      console.log(`    export ${secret}=<your-value>`)
    }
  }

  console.log("  Rebuild to include source:")
  console.log("    hands build")
}

interface RegistryItem {
  name: string
  type: "source"
  title: string
  description: string
  files: Array<{ path: string; target: string }>
  secrets: string[]
  streams: string[]
  tables?: string[]
  schedule?: string
}

interface Registry {
  $schema?: string
  name: string
  version: string
  items: RegistryItem[]
}

/**
 * Load the source registry from @hands/stdlib
 */
async function loadRegistry(): Promise<Registry> {
  const stdlibPath = getStdlibPath()
  const registryPath = join(stdlibPath, "src/sources/registry.json")

  try {
    const file = Bun.file(registryPath)
    return await file.json()
  } catch (error) {
    console.error(`Failed to load registry: ${error}`)
    process.exit(1)
  }
}

/**
 * Get the path to the stdlib package
 */
function getStdlibPath(): string {
  // Try workspace path (development)
  const devPath = resolve(import.meta.dir, "../../../stdlib")
  if (existsSync(join(devPath, "src/sources/registry.json"))) {
    return devPath
  }

  // Try node_modules path
  const nodeModulesPath = join(process.cwd(), "node_modules/@hands/stdlib")
  if (existsSync(nodeModulesPath)) {
    return nodeModulesPath
  }

  // Fall back to dev path
  return devPath
}
