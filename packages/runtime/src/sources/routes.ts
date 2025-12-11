/**
 * Source HTTP Routes
 *
 * Minimal API for sources - runtime executes, orchestrator tracks.
 * Source discovery is handled by manifest endpoint.
 *
 * POST /sources/:id/sync           - Execute sync, returns result
 * GET  /workbook/sources/available - List available sources from registry
 * POST /workbook/sources/add       - Add source from registry to workbook
 */

import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, readdirSync } from "fs"
import { join, dirname, resolve } from "path"
import type { Hono } from "hono"
import type { DbContext } from "@hands/stdlib"
import type { SourceDefinition } from "@hands/stdlib/sources"
import { checkMissingSecrets } from "./secrets.js"
import { executeSync } from "./executor.js"
import type { DiscoveredSource } from "./types.js"
import {
  ensureStdlibSymlink,
  getStdlibSymlinkPath,
  getStdlibSourcePath,
} from "../config/index.js"

// Registry types
interface RegistryItem {
  name: string
  type: "source"
  title: string
  description: string
  files: Array<{ path: string; target: string }>
  dependencies: string[]
  secrets: string[]
  streams: string[]
  tables?: string[]
  schedule?: string
  icon?: string
}

interface Registry {
  $schema?: string
  name: string
  version: string
  items: RegistryItem[]
}

/**
 * Ensure @hands/stdlib is properly referenced in workbook package.json
 * Updates from workspace:* or link: to file: path (using ~/.hands/stdlib symlink)
 */
function ensureStdlibReference(workbookDir: string): void {
  const pkgJsonPath = join(workbookDir, "package.json")
  if (!existsSync(pkgJsonPath)) return

  try {
    // Ensure symlink exists
    ensureStdlibSymlink()
    const symlinkPath = getStdlibSymlinkPath()
    const expectedRef = `file:${symlinkPath}`

    const pkgJson = JSON.parse(readFileSync(pkgJsonPath, "utf-8"))
    const stdlibRef = pkgJson.dependencies?.["@hands/stdlib"]

    // Update if using workspace:*, link:, or wrong file: path
    if (stdlibRef && (stdlibRef === "workspace:*" || stdlibRef.startsWith("link:") || stdlibRef !== expectedRef)) {
      pkgJson.dependencies["@hands/stdlib"] = expectedRef
      writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 2) + "\n")
      console.log(`[sources] Updated stdlib reference to ${expectedRef}`)
    }
  } catch (err) {
    console.error("[sources] Failed to update stdlib reference:", err)
  }
}

/**
 * Get the path to the stdlib package (actual source, not symlink)
 * Used for loading registry files
 */
function getStdlibPath(): string {
  return getStdlibSourcePath()
}

/**
 * Load the source registry
 */
function loadRegistry(): Registry | null {
  const stdlibPath = getStdlibPath()
  const registryPath = join(stdlibPath, "src/registry/sources/registry.json")

  try {
    const content = readFileSync(registryPath, "utf-8")
    return JSON.parse(content)
  } catch {
    return null
  }
}

interface SourceRoutesConfig {
  workbookDir: string
  getDbContext: () => DbContext | null
  isDbReady: () => boolean
}

/**
 * Get a source by ID - local discovery for sync endpoint
 */
async function getSource(workbookDir: string, sourceId: string): Promise<DiscoveredSource | null> {
  const sourcesDir = join(workbookDir, "sources")
  if (!existsSync(sourcesDir)) return null

  const sourceDir = join(sourcesDir, sourceId)
  if (!existsSync(sourceDir)) return null

  // Look for index.ts or index.tsx
  let indexPath: string | null = null
  for (const filename of ["index.ts", "index.tsx"]) {
    const path = join(sourceDir, filename)
    if (existsSync(path)) {
      indexPath = path
      break
    }
  }

  if (!indexPath) return null

  try {
    const mod = await import(indexPath)
    const definition = mod.default as SourceDefinition<any, any> | undefined

    if (definition?.config && typeof definition?.sync === "function") {
      return {
        id: sourceId,
        path: indexPath,
        definition,
      }
    }
  } catch (err) {
    console.error(`[sources] Failed to load ${sourceId}:`, err)
  }

  return null
}

/**
 * Register source routes on a Hono app
 */
export function registerSourceRoutes(app: Hono, config: SourceRoutesConfig) {
  const { workbookDir, getDbContext, isDbReady } = config

  // Execute sync - blocking, returns when complete
  app.post("/sources/:id/sync", async (c) => {
    const sourceId = c.req.param("id")

    // Check database is ready
    if (!isDbReady()) {
      return c.json({ success: false, error: "Database not ready" }, 503)
    }

    const dbContext = getDbContext()
    if (!dbContext) {
      return c.json({ success: false, error: "Database not available" }, 503)
    }

    try {
      const source = await getSource(workbookDir, sourceId)

      if (!source) {
        return c.json({ success: false, error: "Source not found" }, 404)
      }

      // Check for missing secrets
      const missing = checkMissingSecrets(workbookDir, source.definition.config.secrets)
      if (missing.length > 0) {
        return c.json(
          {
            success: false,
            error: "Missing secrets",
            missing,
          },
          400
        )
      }

      // Execute sync (blocking)
      const result = await executeSync(source, dbContext, workbookDir)

      // Return HTTP status based on success
      return c.json(result, result.success ? 200 : 500)
    } catch (err) {
      console.error("[sources] Error executing sync:", err)
      return c.json(
        {
          success: false,
          error: err instanceof Error ? err.message : "Unknown error",
          durationMs: 0,
        },
        500
      )
    }
  })

  // ============================================
  // Registry Routes - for adding sources from registry
  // ============================================

  // List available sources from registry
  app.get("/workbook/sources/available", (c) => {
    const registry = loadRegistry()

    if (!registry) {
      return c.json({ sources: [], error: "Registry not found" })
    }

    const sources = registry.items.map((item) => ({
      name: item.name,
      title: item.title,
      description: item.description,
      secrets: item.secrets,
      streams: item.streams,
      schedule: item.schedule,
      icon: item.icon,
    }))

    return c.json({ sources })
  })

  // Add source from registry to workbook
  app.post("/workbook/sources/add", async (c) => {
    const { sourceName, schedule } = await c.req.json<{ sourceName: string; schedule?: string }>()

    if (!sourceName) {
      return c.json({ success: false, error: "sourceName is required" }, 400)
    }

    const registry = loadRegistry()
    if (!registry) {
      return c.json({ success: false, error: "Registry not found" }, 500)
    }

    const registryItem = registry.items.find((i) => i.name === sourceName)
    if (!registryItem) {
      return c.json({ success: false, error: `Source "${sourceName}" not found in registry` }, 404)
    }

    const stdlibPath = getStdlibPath()
    const filesCreated: string[] = []
    const errors: string[] = []

    // Ensure @hands/stdlib is linked for source imports
    ensureStdlibReference(workbookDir)

    // Copy each file from registry
    for (const file of registryItem.files) {
      const sourcePath = join(stdlibPath, "src/registry/sources", file.path)
      const targetPath = join(workbookDir, file.target)

      try {
        if (!existsSync(sourcePath)) {
          errors.push(`Source file not found: ${sourcePath}`)
          continue
        }

        // Create target directory
        mkdirSync(dirname(targetPath), { recursive: true })

        // Check if target already exists
        if (existsSync(targetPath)) {
          continue // Skip existing files
        }

        // Copy file
        copyFileSync(sourcePath, targetPath)
        filesCreated.push(file.target)
      } catch (error) {
        errors.push(`Failed to copy ${file.path}: ${error}`)
      }
    }

    // Update hands.json
    try {
      const handsJsonPath = join(workbookDir, "hands.json")
      let config: Record<string, any> = {}

      if (existsSync(handsJsonPath)) {
        config = JSON.parse(readFileSync(handsJsonPath, "utf-8"))
      }

      // Initialize sources and secrets if needed
      config.sources = config.sources || {}
      config.secrets = config.secrets || {}

      // Add source if not already present
      if (!config.sources[sourceName]) {
        config.sources[sourceName] = {
          enabled: true,
          schedule: schedule ?? registryItem.schedule,
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

        writeFileSync(handsJsonPath, JSON.stringify(config, null, 2) + "\n")
      }
    } catch (error) {
      errors.push(`Failed to update hands.json: ${error}`)
    }

    // Build next steps
    const nextSteps: string[] = []
    if (registryItem.dependencies.length > 0) {
      nextSteps.push(`Run "bun install" to install dependencies: ${registryItem.dependencies.join(", ")}`)
    }
    if (registryItem.secrets.length > 0) {
      nextSteps.push(`Set secrets in .env.local: ${registryItem.secrets.join(", ")}`)
    }

    if (errors.length > 0) {
      return c.json({ success: false, filesCreated, errors, nextSteps }, 500)
    }

    return c.json({ success: true, filesCreated, errors: [], nextSteps })
  })
}
