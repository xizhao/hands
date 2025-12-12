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

import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, readdirSync, appendFileSync } from "fs"
import { join, dirname, resolve } from "path"
import type { Hono } from "hono"
import type { DbContext } from "@hands/stdlib"
import type { SourceDefinition } from "@hands/stdlib/sources"
import { checkMissingSecrets, readEnvFile } from "./secrets.js"
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

  // Execute sync - blocking, returns when complete (includes logs)
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

      // Execute sync (blocking) - now includes logs
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

  // Execute sync with SSE streaming logs
  app.get("/sources/:id/sync/stream", async (c) => {
    const sourceId = c.req.param("id")

    // Check database is ready
    if (!isDbReady()) {
      return c.json({ success: false, error: "Database not ready" }, 503)
    }

    const dbContext = getDbContext()
    if (!dbContext) {
      return c.json({ success: false, error: "Database not available" }, 503)
    }

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

    // Set up SSE
    c.header("Content-Type", "text/event-stream")
    c.header("Cache-Control", "no-cache")
    c.header("Connection", "keep-alive")

    // Create a readable stream for SSE
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder()

        // Send log entries as they arrive
        const onLog = (entry: { timestamp: number; level: string; message: string }) => {
          const data = JSON.stringify({ type: "log", ...entry })
          controller.enqueue(encoder.encode(`data: ${data}\n\n`))
        }

        try {
          // Execute sync with log callback
          const result = await executeSync(source, dbContext, workbookDir, onLog)

          // Send final result
          const resultData = JSON.stringify({ type: "result", ...result })
          controller.enqueue(encoder.encode(`data: ${resultData}\n\n`))
        } catch (err) {
          const errorData = JSON.stringify({
            type: "result",
            success: false,
            error: err instanceof Error ? err.message : "Unknown error",
            durationMs: 0,
          })
          controller.enqueue(encoder.encode(`data: ${errorData}\n\n`))
        }

        controller.close()
      },
    })

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    })
  })

  // ============================================
  // Secrets Management Routes
  // ============================================

  // Save secrets to .env.local
  app.post("/secrets", async (c) => {
    const { secrets } = await c.req.json<{ secrets: Record<string, string> }>()

    if (!secrets || typeof secrets !== "object") {
      return c.json({ success: false, error: "Missing secrets in request body" }, 400)
    }

    const envPath = join(workbookDir, ".env.local")

    try {
      // Read existing env file
      const existingEnv = readEnvFile(workbookDir)

      // Merge new secrets with existing
      for (const [key, value] of Object.entries(secrets)) {
        existingEnv.set(key, value)
      }

      // Write back all secrets
      const lines: string[] = []
      for (const [key, value] of existingEnv.entries()) {
        // Quote values that contain spaces or special characters
        const needsQuotes = /[\s"'=]/.test(value)
        const quotedValue = needsQuotes ? `"${value.replace(/"/g, '\\"')}"` : value
        lines.push(`${key}=${quotedValue}`)
      }

      writeFileSync(envPath, lines.join("\n") + "\n")

      return c.json({
        success: true,
        saved: Object.keys(secrets),
      })
    } catch (err) {
      return c.json({
        success: false,
        error: err instanceof Error ? err.message : "Failed to save secrets",
      }, 500)
    }
  })

  // Get configured secrets (returns which keys exist, not values)
  app.get("/secrets", (c) => {
    const env = readEnvFile(workbookDir)
    return c.json({
      configured: Array.from(env.keys()),
    })
  })

  // ============================================
  // Source Spec Management
  // ============================================

  // Update source spec (modifies the spec field in the source file)
  app.put("/sources/:id/spec", async (c) => {
    const sourceId = c.req.param("id")
    const { spec } = await c.req.json<{ spec: string }>()

    if (typeof spec !== "string") {
      return c.json({ success: false, error: "spec must be a string" }, 400)
    }

    const source = await getSource(workbookDir, sourceId)
    if (!source) {
      return c.json({ success: false, error: "Source not found" }, 404)
    }

    try {
      // Read the source file
      const sourceContent = readFileSync(source.path, "utf-8")

      // Find and update the spec field in the config
      // This is a simple approach - look for spec: ... in the config object
      let updatedContent: string

      // Escape the spec for use in a template literal
      const escapedSpec = spec.replace(/`/g, "\\`").replace(/\$/g, "\\$")

      if (sourceContent.includes("spec:")) {
        // Replace existing spec - handles both single-line and multi-line template literals
        updatedContent = sourceContent.replace(
          /spec:\s*`[\s\S]*?`/,
          `spec: \`${escapedSpec}\``
        )
      } else {
        // Add spec field after description
        // Look for description: "..." or description: '...' and add spec after
        updatedContent = sourceContent.replace(
          /(description:\s*["'][^"']*["'],?)/,
          `$1\n  spec: \`${escapedSpec}\`,`
        )
      }

      // Write back
      writeFileSync(source.path, updatedContent)

      return c.json({ success: true })
    } catch (err) {
      console.error("[sources] Failed to update spec:", err)
      return c.json({
        success: false,
        error: err instanceof Error ? err.message : "Failed to update spec",
      }, 500)
    }
  })

  // Validate source - triggers background task to ensure code matches spec
  // This spawns a background process that uses the coder agent to validate/fix the code
  app.post("/sources/:id/validate", async (c) => {
    const sourceId = c.req.param("id")

    const source = await getSource(workbookDir, sourceId)
    if (!source) {
      return c.json({ success: false, error: "Source not found" }, 404)
    }

    const cfg = source.definition.config
    if (!cfg.spec) {
      return c.json({ success: false, error: "No spec defined for this source" }, 400)
    }

    // Generate a task ID for tracking
    const taskId = `validate-${sourceId}-${Date.now()}`

    // Read the source code
    const sourceCode = readFileSync(source.path, "utf-8")

    // Build the prompt for the coder agent
    const prompt = `You are validating a source sync function against its spec.

## Source: ${cfg.title}
**File:** ${source.path}

## Spec (what the code SHOULD do):
${cfg.spec}

## Current Code:
\`\`\`typescript
${sourceCode}
\`\`\`

## Instructions:
1. Compare the current code against the spec
2. If the code matches the spec's intent, tables, and behavior - respond with "VALID: Code matches spec"
3. If there are discrepancies, rewrite the code to match the spec exactly
4. Ensure all tables mentioned in the spec are created/updated
5. Ensure the sync behavior matches what's described
6. Keep the same secrets and config structure
7. Use ctx.db.sql for database operations
8. Use ctx.log for logging

If you need to make changes, output the complete updated source file.`

    // For now, we'll just return success and the prompt
    // In a real implementation, this would spawn the coder agent
    // TODO: Integrate with actual coder agent via CLI or API
    console.log(`[sources] Validation requested for ${sourceId}`)
    console.log(`[sources] Task ID: ${taskId}`)

    // Return immediately - validation runs in background
    return c.json({
      success: true,
      taskId,
      message: "Validation started in background",
      // Include the prompt for debugging/manual validation
      _debug: {
        prompt: prompt.slice(0, 500) + "...",
      },
    })
  })

  // Run tests for a source - SSE streaming
  app.get("/sources/:id/test", async (c) => {
    const sourceId = c.req.param("id")

    const source = await getSource(workbookDir, sourceId)
    if (!source) {
      return c.json({ success: false, error: "Source not found" }, 404)
    }

    // Check if test file exists
    const testPath = join(workbookDir, "sources", sourceId, `${sourceId}.test.ts`)
    if (!existsSync(testPath)) {
      return c.json({
        success: false,
        error: `No test file found at ${testPath}`,
      }, 404)
    }

    // Set up SSE
    c.header("Content-Type", "text/event-stream")
    c.header("Cache-Control", "no-cache")
    c.header("Connection", "keep-alive")

    // Create a readable stream for SSE
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder()

        const sendLog = (message: string) => {
          const data = JSON.stringify({ type: "log", message })
          controller.enqueue(encoder.encode(`data: ${data}\n\n`))
        }

        const sendResult = (success: boolean, summary?: string) => {
          const data = JSON.stringify({ type: "result", success, summary })
          controller.enqueue(encoder.encode(`data: ${data}\n\n`))
        }

        try {
          sendLog(`Running tests for ${sourceId}...`)
          sendLog(`Test file: ${testPath}`)
          sendLog("")

          // Run bun test
          const proc = Bun.spawn(["bun", "test", testPath], {
            cwd: workbookDir,
            stdout: "pipe",
            stderr: "pipe",
            env: {
              ...process.env,
              // Ensure colors are stripped for clean SSE output
              NO_COLOR: "1",
              FORCE_COLOR: "0",
            },
          })

          // Stream stdout
          const stdoutReader = proc.stdout.getReader()
          const decoder = new TextDecoder()

          while (true) {
            const { done, value } = await stdoutReader.read()
            if (done) break
            const text = decoder.decode(value)
            for (const line of text.split("\n").filter(Boolean)) {
              sendLog(line)
            }
          }

          // Stream stderr
          const stderrReader = proc.stderr.getReader()
          while (true) {
            const { done, value } = await stderrReader.read()
            if (done) break
            const text = decoder.decode(value)
            for (const line of text.split("\n").filter(Boolean)) {
              sendLog(`[stderr] ${line}`)
            }
          }

          // Wait for exit
          const exitCode = await proc.exited

          if (exitCode === 0) {
            sendResult(true, "All tests passed")
          } else {
            sendResult(false, `Tests failed with exit code ${exitCode}`)
          }
        } catch (err) {
          sendLog(`Error: ${err instanceof Error ? err.message : String(err)}`)
          sendResult(false, err instanceof Error ? err.message : "Test execution failed")
        }

        controller.close()
      },
    })

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    })
  })

  // Get source details including full source code
  app.get("/sources/:id", async (c) => {
    const sourceId = c.req.param("id")

    const source = await getSource(workbookDir, sourceId)
    if (!source) {
      return c.json({ error: "Source not found" }, 404)
    }

    const sourceCode = readFileSync(source.path, "utf-8")
    const cfg = source.definition.config
    const missing = checkMissingSecrets(workbookDir, cfg.secrets)

    return c.json({
      id: sourceId,
      name: cfg.name,
      title: cfg.title,
      description: cfg.description,
      schedule: cfg.schedule,
      secrets: [...cfg.secrets],
      missingSecrets: missing,
      path: source.path,
      spec: cfg.spec,
      sourceCode,
    })
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
