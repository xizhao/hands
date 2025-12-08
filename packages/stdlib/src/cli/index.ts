#!/usr/bin/env bun
/**
 * Hands CLI
 *
 * Usage:
 *   hands init <name>           Create a new workbook
 *   hands add source <name>     Add a source from the registry
 *   hands build                 Generate .hands/ from hands.json
 *   hands dev                   Start the dev server
 *   hands sources               List available sources
 */

import { build } from "../build/index.js"
import { addSource, listSources } from "./add.js"
import { createDefaultHandsJson, saveHandsJson } from "../build/schema.js"
import { mkdir } from "fs/promises"
import { join } from "path"
import { existsSync } from "fs"

const HELP = `
hands - Data analysis workbook CLI

Usage:
  hands init <name>           Create a new workbook
  hands add source <name>     Add a source from the registry
  hands build                 Generate .hands/ from hands.json
  hands dev                   Start the dev server
  hands sources               List available sources

Examples:
  hands init my-dashboard
  cd my-dashboard
  hands add source hackernews
  hands build
  hands dev
`

async function main() {
  const args = process.argv.slice(2)
  const command = args[0]

  switch (command) {
    case "init":
      await handleInit(args.slice(1))
      break

    case "add":
      await handleAdd(args.slice(1))
      break

    case "build":
      await handleBuild(args.slice(1))
      break

    case "dev":
      await handleDev(args.slice(1))
      break

    case "sources":
      handleSources()
      break

    case "help":
    case "--help":
    case "-h":
      console.log(HELP)
      break

    default:
      if (command) {
        console.error(`Unknown command: ${command}`)
      }
      console.log(HELP)
      process.exit(command ? 1 : 0)
  }
}

async function handleInit(args: string[]) {
  const name = args[0]

  if (!name) {
    console.error("Usage: hands init <name>")
    process.exit(1)
  }

  const targetDir = join(process.cwd(), name)

  if (existsSync(targetDir)) {
    console.error(`Directory already exists: ${name}`)
    process.exit(1)
  }

  console.log(`Creating workbook: ${name}`)

  // Create directory structure
  await mkdir(targetDir, { recursive: true })
  await mkdir(join(targetDir, "src"), { recursive: true })
  await mkdir(join(targetDir, "sources"), { recursive: true })
  await mkdir(join(targetDir, "migrations"), { recursive: true })

  // Create hands.json
  const config = createDefaultHandsJson(name)
  await saveHandsJson(targetDir, config)
  console.log("  Created: hands.json")

  // Create minimal src/index.tsx
  const indexContent = `import { Hono } from "hono"

const app = new Hono()

app.get("/", (c) => {
  return c.html(\`
    <!DOCTYPE html>
    <html>
      <head>
        <title>${name}</title>
      </head>
      <body>
        <h1>Welcome to ${name}</h1>
        <p>Edit src/index.tsx to get started.</p>
      </body>
    </html>
  \`)
})

export default app
`
  await Bun.write(join(targetDir, "src/index.tsx"), indexContent)
  console.log("  Created: src/index.tsx")

  // Create package.json
  const packageJson = {
    name: `@hands/${name}`,
    version: "0.0.1",
    private: true,
    type: "module",
    scripts: {
      dev: "hands dev",
      build: "hands build",
    },
    dependencies: {
      "@hands/stdlib": "workspace:*",
      hono: "^4",
    },
    devDependencies: {
      "@cloudflare/workers-types": "^4",
      typescript: "^5",
    },
  }
  await Bun.write(join(targetDir, "package.json"), JSON.stringify(packageJson, null, 2) + "\n")
  console.log("  Created: package.json")

  // Create tsconfig.json
  const tsConfig = {
    compilerOptions: {
      target: "ESNext",
      module: "ESNext",
      moduleResolution: "bundler",
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      jsx: "react-jsx",
      jsxImportSource: "hono/jsx",
    },
    include: ["src/**/*", "sources/**/*"],
  }
  await Bun.write(join(targetDir, "tsconfig.json"), JSON.stringify(tsConfig, null, 2) + "\n")
  console.log("  Created: tsconfig.json")

  // Create .gitignore
  const gitignore = `node_modules/
.hands/
postgres/
*.log
`
  await Bun.write(join(targetDir, ".gitignore"), gitignore)
  console.log("  Created: .gitignore")

  console.log()
  console.log("Done! Next steps:")
  console.log(`  cd ${name}`)
  console.log("  bun install")
  console.log("  hands add source hackernews  # optional")
  console.log("  hands dev")
}

async function handleAdd(args: string[]) {
  const subcommand = args[0]

  if (subcommand !== "source") {
    console.error("Usage: hands add source <name>")
    process.exit(1)
  }

  const sourceName = args[1]

  if (!sourceName) {
    console.error("Usage: hands add source <name>")
    console.error()
    console.error("Available sources:")
    const sources = listSources()
    for (const source of sources) {
      console.error(`  ${source.name.padEnd(15)} ${source.title} - ${source.description}`)
    }
    process.exit(1)
  }

  const result = await addSource(sourceName)

  if (!result.success) {
    console.error("Failed to add source:")
    for (const error of result.errors) {
      console.error(`  ${error}`)
    }
    process.exit(1)
  }

  console.log()
  console.log(`Added source: ${sourceName}`)

  if (result.nextSteps.length > 0) {
    console.log()
    console.log("Next steps:")
    for (const step of result.nextSteps) {
      console.log(`  ${step}`)
    }
  }
}

async function handleBuild(args: string[]) {
  const verbose = args.includes("--verbose") || args.includes("-v")
  const dev = args.includes("--dev")

  console.log("Building workbook...")

  const result = await build(process.cwd(), { verbose, dev })

  if (!result.success) {
    console.error("Build failed:")
    for (const error of result.errors) {
      console.error(`  ${error}`)
    }
    process.exit(1)
  }

  console.log(`Generated ${result.files.length} files in ${result.outputDir}`)

  if (verbose) {
    for (const file of result.files) {
      console.log(`  ${file}`)
    }
  }
}

async function handleDev(_args: string[]) {
  // First, run build
  console.log("Building...")
  const buildResult = await build(process.cwd(), { dev: true })

  if (!buildResult.success) {
    console.error("Build failed:")
    for (const error of buildResult.errors) {
      console.error(`  ${error}`)
    }
    process.exit(1)
  }

  // Then delegate to runtime
  // For now, just print instructions
  console.log()
  console.log("Build complete. To start dev server, run:")
  console.log()
  console.log("  bun run @hands/runtime --workbook-dir=. --workbook-id=$(jq -r .name hands.json)")
  console.log()
  console.log("Or if using the desktop app, open this workbook there.")

  // TODO: Actually spawn runtime process when integrated
  // const runtime = Bun.spawn(["bun", "run", "@hands/runtime", ...], { ... })
}

function handleSources() {
  const sources = listSources()

  console.log("Available sources:")
  console.log()

  for (const source of sources) {
    console.log(`${source.name}`)
    console.log(`  ${source.title} - ${source.description}`)
    if (source.secrets.length > 0) {
      console.log(`  Secrets: ${source.secrets.join(", ")}`)
    }
    console.log(`  Streams: ${source.streams.join(", ")}`)
    console.log()
  }
}

main().catch((error) => {
  console.error("Error:", error)
  process.exit(1)
})
