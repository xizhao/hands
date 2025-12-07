#!/usr/bin/env bun
/**
 * Bundle opencode agents and tools from packages/agent into Tauri resources
 *
 * Usage:
 *   bun run scripts/bundle-plugin.ts         # Build once
 *   bun run scripts/bundle-plugin.ts --watch # Watch mode for dev
 *
 * This script:
 * 1. Copies agents (*.md) from packages/agent/agent/ to resources/opencode/agent/
 * 2. Bundles tools (*.ts) from packages/agent/tool/ to resources/opencode/tool/
 * 3. Copies opencode.json config
 */

import path from "path"
import fs from "fs/promises"

const ROOT = path.resolve(import.meta.dirname, "..")
const AGENT_PKG = path.resolve(ROOT, "../agent")
const RESOURCES_DIR = path.resolve(ROOT, "src-tauri/resources/opencode")

const AGENTS_SRC = path.join(AGENT_PKG, "agent")
const TOOLS_SRC = path.join(AGENT_PKG, "tool")
const AGENTS_DEST = path.join(RESOURCES_DIR, "agent")
const TOOLS_DEST = path.join(RESOURCES_DIR, "tool")

// Map of tool files to their export names
const toolExports: Record<string, string> = {
  "sql.ts": "sqlTool",
  "dashboard.ts": "dashboardTool",
  "introspect.ts": "introspectTool",
  "deploy.ts": "deployTool",
  "monitor.ts": "monitorTool",
  "describe.ts": "describeTool",
}

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true })
}

async function copyAgents() {
  await ensureDir(AGENTS_DEST)

  const files = await fs.readdir(AGENTS_SRC)
  for (const file of files) {
    if (!file.endsWith(".md")) continue
    const src = path.join(AGENTS_SRC, file)
    const dest = path.join(AGENTS_DEST, file)
    await fs.copyFile(src, dest)
    console.log(`  Copied agent: ${file}`)
  }
}

async function bundleTools() {
  await ensureDir(TOOLS_DEST)

  const files = await fs.readdir(TOOLS_SRC)

  for (const file of files) {
    if (!file.endsWith(".ts")) continue

    const toolName = file.replace(".ts", "")
    const entrypoint = path.join(TOOLS_SRC, file)
    const exportName = toolExports[file]

    console.log(`  Bundling tool: ${toolName}...`)

    const result = await Bun.build({
      entrypoints: [entrypoint],
      outdir: TOOLS_DEST,
      target: "bun",
      format: "esm",
      naming: `${toolName}.js`,
      external: ["@opencode-ai/plugin", "zod", "postgres"],
    })

    if (!result.success) {
      console.error(`Failed to bundle ${toolName}:`)
      for (const log of result.logs) {
        console.error(log)
      }
      process.exit(1)
    }

    // Add default export if we know the export name
    if (exportName) {
      const outPath = path.join(TOOLS_DEST, `${toolName}.js`)
      let content = await Bun.file(outPath).text()
      if (!content.includes("export default")) {
        content += `\nexport default ${exportName};\n`
        await Bun.write(outPath, content)
      }
    }
  }
}

async function copyConfig() {
  const src = path.join(AGENT_PKG, "opencode.json")
  const dest = path.join(RESOURCES_DIR, "opencode.json")
  await fs.copyFile(src, dest)
  console.log(`  Copied config: opencode.json`)
}

async function build() {
  console.log("Bundling opencode agents and tools...")

  await ensureDir(RESOURCES_DIR)
  await copyAgents()
  await bundleTools()
  await copyConfig()

  console.log("Bundle complete!")
}

async function watch() {
  console.log("Watching for changes in packages/agent...")

  // Initial build
  await build()

  // Watch agents
  const agentWatcher = fs.watch(AGENTS_SRC, { recursive: true })
  const toolWatcher = fs.watch(TOOLS_SRC, { recursive: true })
  const configWatcher = fs.watch(path.join(AGENT_PKG, "opencode.json"))

  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  const rebuild = (what: string) => {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(async () => {
      console.log(`\nChange detected in ${what}, rebuilding...`)
      try {
        await build()
      } catch (err) {
        console.error("Build failed:", err)
      }
    }, 100)
  }

  ;(async () => {
    for await (const event of agentWatcher) {
      rebuild(`agent/${event.filename}`)
    }
  })()

  ;(async () => {
    for await (const event of toolWatcher) {
      rebuild(`tool/${event.filename}`)
    }
  })()

  ;(async () => {
    for await (const _ of configWatcher) {
      rebuild("opencode.json")
    }
  })()

  // Keep process alive
  console.log("Watching... Press Ctrl+C to stop.")
  await new Promise(() => {})
}

// Main
const isWatch = process.argv.includes("--watch")

if (isWatch) {
  await watch()
} else {
  await build()
}
