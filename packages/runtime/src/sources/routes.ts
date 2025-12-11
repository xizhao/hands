/**
 * Source HTTP Routes
 *
 * Minimal API for sources - runtime executes, orchestrator tracks.
 *
 * GET  /sources                    - List installed sources
 * POST /sources/:id/sync           - Execute sync, returns result
 * GET  /workbook/sources/available - List available sources from registry
 * POST /workbook/sources/add       - Add source from registry to workbook
 */

import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync } from "fs"
import { join, dirname, resolve } from "path"
import type { Hono } from "hono"
import type { DbContext } from "@hands/stdlib"
import { discoverSources, getSource } from "./discovery.js"
import { checkMissingSecrets } from "./secrets.js"
import { executeSync } from "./executor.js"

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
 * Get the path to the stdlib package
 */
function getStdlibPath(): string {
  // Try workspace path (development) - relative to runtime/src/sources/
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
 * Register source routes on a Hono app
 */
export function registerSourceRoutes(app: Hono, config: SourceRoutesConfig) {
  const { workbookDir, getDbContext, isDbReady } = config

  // List all installed sources
  app.get("/sources", async (c) => {
    try {
      const discovered = await discoverSources(workbookDir)

      const sources = discovered.map((s) => {
        const cfg = s.definition.config
        const missingSecrets = checkMissingSecrets(workbookDir, cfg.secrets)

        return {
          id: s.id,
          name: cfg.name,
          title: cfg.title,
          description: cfg.description,
          schedule: cfg.schedule,
          secrets: [...cfg.secrets],
          missingSecrets,
        }
      })

      return c.json({ sources })
    } catch (err) {
      console.error("[sources] Error listing sources:", err)
      return c.json({ sources: [], error: String(err) }, 500)
    }
  })

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
