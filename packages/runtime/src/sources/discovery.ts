/**
 * Source Discovery
 *
 * Scans workbook/sources/ directory for source definitions.
 * Each subdirectory with an index.ts that exports a SourceDefinition is registered.
 */

import { existsSync, readdirSync } from "fs"
import { join } from "path"
import type { SourceDefinition } from "@hands/stdlib/sources"
import type { DiscoveredSource } from "./types.js"

/**
 * Discover all sources in a workbook's sources/ directory
 */
export async function discoverSources(workbookDir: string): Promise<DiscoveredSource[]> {
  const sourcesDir = join(workbookDir, "sources")

  if (!existsSync(sourcesDir)) {
    return []
  }

  const sources: DiscoveredSource[] = []
  const entries = readdirSync(sourcesDir, { withFileTypes: true })

  for (const entry of entries) {
    if (!entry.isDirectory()) continue

    // Look for index.ts or index.tsx
    const sourceDir = join(sourcesDir, entry.name)
    let indexPath: string | null = null

    for (const filename of ["index.ts", "index.tsx"]) {
      const path = join(sourceDir, filename)
      if (existsSync(path)) {
        indexPath = path
        break
      }
    }

    if (!indexPath) continue

    try {
      // Dynamic import - Bun will handle TypeScript
      const mod = await import(indexPath)
      const definition = mod.default as SourceDefinition<any, any> | undefined

      // Validate it's a proper source definition
      if (definition?.config && typeof definition?.sync === "function") {
        sources.push({
          id: entry.name,
          path: indexPath,
          definition,
        })
      } else {
        console.warn(`[sources] ${entry.name}/index.ts does not export a valid source definition`)
      }
    } catch (err) {
      console.error(`[sources] Failed to load ${entry.name}:`, err)
    }
  }

  return sources
}

/**
 * Get a single source by ID
 */
export async function getSource(
  workbookDir: string,
  sourceId: string
): Promise<DiscoveredSource | null> {
  const sources = await discoverSources(workbookDir)
  return sources.find((s) => s.id === sourceId) ?? null
}

/**
 * Check if sources directory exists
 */
export function sourcesDirectoryExists(workbookDir: string): boolean {
  return existsSync(join(workbookDir, "sources"))
}
