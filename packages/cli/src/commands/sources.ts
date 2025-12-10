/**
 * hands sources - List available sources from the registry
 */

import { existsSync } from "fs"
import { join, resolve } from "path"

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

export async function sourcesCommand() {
  const registry = await loadRegistry()

  console.log("Available sources:")
  console.log()

  for (const item of registry.items) {
    console.log(`${item.name}`)
    console.log(`  ${item.title} - ${item.description}`)

    if (item.secrets.length > 0) {
      console.log(`  Secrets: ${item.secrets.join(", ")}`)
    }

    console.log(`  Streams: ${item.streams.join(", ")}`)

    if (item.schedule) {
      console.log(`  Schedule: ${item.schedule}`)
    }

    console.log()
  }
}

/**
 * Load the source registry from @hands/stdlib
 */
async function loadRegistry(): Promise<Registry> {
  const stdlibPath = getStdlibPath()
  const registryPath = join(stdlibPath, "src/registry/sources/registry.json")

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
  if (existsSync(join(devPath, "src/registry/sources/registry.json"))) {
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
