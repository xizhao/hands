#!/usr/bin/env bun
/**
 * Bundle @hands/plugin tools into the Tauri resources folder
 * This runs before Tauri build to embed tools and agents
 *
 * OpenCode loads tools from .opencode/tool/*.{js,ts} via import()
 * Tool files should export default or named exports - the tool ID is:
 * - filename for default export (e.g., sql.js -> "sql")
 * - filename_exportName for named exports (e.g., sql.js exports foo -> "sql_foo")
 */

import path from "path"
import fs from "fs/promises"

const ROOT = path.resolve(import.meta.dirname, "..")
const PLUGIN_DIR = path.resolve(ROOT, "../plugin")
const RESOURCES_DIR = path.resolve(ROOT, "src-tauri/resources/opencode")
const TOOLS_DIR = path.join(RESOURCES_DIR, "tool")

// Ensure directories exist
await fs.mkdir(TOOLS_DIR, { recursive: true })

console.log("Bundling hands tools...")

// Map of tool files to their export names (what the source file exports)
const toolExports: Record<string, string> = {
  "sql.ts": "sqlTool",
  "dashboard.ts": "dashboardTool",
  "introspect.ts": "introspectTool",
  "deploy.ts": "deployTool",
  "monitor.ts": "monitorTool",
  "describe.ts": "describeTool",
}

// Find all tool files in the plugin
const toolsSource = path.join(PLUGIN_DIR, "src/tools")
const toolFiles = await fs.readdir(toolsSource)

for (const file of toolFiles) {
  if (!file.endsWith(".ts")) continue

  const toolName = file.replace(".ts", "")
  const entrypoint = path.join(toolsSource, file)
  const exportName = toolExports[file]

  console.log(`  Bundling ${toolName}...`)

  const result = await Bun.build({
    entrypoints: [entrypoint],
    outdir: TOOLS_DIR,
    target: "bun",
    format: "esm",
    naming: `${toolName}.js`,
    // These are available in opencode's runtime
    external: ["@opencode-ai/plugin", "zod", "postgres"],
  })

  if (!result.success) {
    console.error(`Failed to bundle ${toolName}:`)
    for (const log of result.logs) {
      console.error(log)
    }
    process.exit(1)
  }

  // Post-process: add default export if we know the export name
  if (exportName) {
    const outPath = path.join(TOOLS_DIR, `${toolName}.js`)
    let content = await Bun.file(outPath).text()
    // Add default export at the end
    if (!content.includes("export default")) {
      content += `\nexport default ${exportName};\n`
      await Bun.write(outPath, content)
    }
  }
}

console.log(`Bundled ${toolFiles.filter(f => f.endsWith(".ts")).length} tools to ${TOOLS_DIR}`)

// Ensure opencode.json exists (no plugin reference needed - tools load from tool/)
const configPath = path.join(RESOURCES_DIR, "opencode.json")
const config = {
  "$schema": "https://opencode.ai/config.json"
}
await Bun.write(configPath, JSON.stringify(config, null, 2))

console.log("Tools bundled successfully!")
