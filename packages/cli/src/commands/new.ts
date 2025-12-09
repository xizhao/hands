/**
 * hands new <name> - Create a new workbook
 *
 * Creates a new workbook with the standard structure:
 *   - hands.json
 *   - pages/index.md
 *   - blocks/example.tsx
 *   - blocks/ui/.gitkeep
 *   - sources/
 *   - migrations/
 */

import { existsSync, readFileSync } from "fs"
import { mkdir } from "fs/promises"
import { join, dirname } from "path"
import { createDefaultHandsJson, saveHandsJson, slugify } from "./utils.js"

/**
 * Find the monorepo root and stdlib path for local development linking
 */
function findStdlibPath(): string | null {
  // Start from CLI package and walk up to find monorepo root
  let current = dirname(dirname(dirname(import.meta.dir)))

  for (let i = 0; i < 10; i++) {
    const pkgPath = join(current, "package.json")
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"))
        if (pkg.workspaces) {
          // Found monorepo root, check for stdlib
          const stdlibPath = join(current, "packages", "stdlib")
          if (existsSync(join(stdlibPath, "package.json"))) {
            return stdlibPath
          }
        }
      } catch {}
    }
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }
  return null
}

interface NewOptions {
  template?: string
}

export async function newCommand(name: string, options: NewOptions) {
  const slug = slugify(name)
  const targetDir = join(process.cwd(), slug)

  // Check if directory already exists
  if (existsSync(targetDir)) {
    console.error(`Error: Directory already exists: ${slug}`)
    process.exit(1)
  }

  console.log(`Creating workbook: ${name}`)

  // Create directory structure
  await mkdir(targetDir, { recursive: true })
  await mkdir(join(targetDir, "pages"), { recursive: true })
  await mkdir(join(targetDir, "blocks"), { recursive: true })
  await mkdir(join(targetDir, "blocks/ui"), { recursive: true })
  await mkdir(join(targetDir, "sources"), { recursive: true })
  await mkdir(join(targetDir, "migrations"), { recursive: true })

  // Create hands.json
  const config = createDefaultHandsJson(slug)
  await saveHandsJson(targetDir, config)
  console.log("  Created: hands.json")

  // Create pages/index.md
  const indexMd = `---
title: ${name}
description: A Hands workbook
---

# ${name}

Welcome to your new workbook!

## Getting Started

Edit this page in \`pages/index.md\` or create new pages in the \`pages/\` directory.

## Blocks

You can embed blocks in your pages using MDX syntax:

<Block id="example" message="Hello from a block!" />

Edit blocks in the \`blocks/\` directory.
`
  await Bun.write(join(targetDir, "pages/index.md"), indexMd)
  console.log("  Created: pages/index.md")

  // Create blocks/example.tsx
  const exampleBlock = `/**
 * Example Block
 *
 * Blocks are server-rendered React components that can query the database
 * and render data. They are embedded in pages using MDX syntax.
 */
import type { BlockFn } from "@hands/stdlib";

interface Props {
  message?: string;
}

export const meta = {
  title: "Example Block",
  description: "A simple example block",
  refreshable: true,
};

const ExampleBlock: BlockFn<Props> = async (props, ctx) => {
  const { message = "Hello, World!" } = props;

  // Example: Query the database
  // const users = await ctx.db\`SELECT * FROM users LIMIT 5\`;

  return (
    <div className="p-4 border rounded-lg bg-card">
      <h3 className="font-semibold text-lg mb-2">Example Block</h3>
      <p className="text-muted-foreground">{message}</p>
      {/* <pre>{JSON.stringify(users, null, 2)}</pre> */}
    </div>
  );
};

export default ExampleBlock;
`
  await Bun.write(join(targetDir, "blocks/example.tsx"), exampleBlock)
  console.log("  Created: blocks/example.tsx")

  // Create blocks/ui/.gitkeep
  await Bun.write(join(targetDir, "blocks/ui/.gitkeep"), "")
  console.log("  Created: blocks/ui/")

  // Create package.json
  // Note: @hands/stdlib is NOT listed here - it's linked by the runtime at dev time
  // This keeps bun install working without needing a published package
  const packageJson = {
    name: `@hands/${slug}`,
    version: "0.0.1",
    private: true,
    type: "module",
    scripts: {
      dev: "hands dev",
      build: "hands build",
    },
    dependencies: {
      hono: "^4",
      react: "^19",
      "react-dom": "^19",
      postgres: "^3.4.7",
    },
    devDependencies: {
      "@cloudflare/workers-types": "^4",
      "@types/react": "^19",
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
      paths: {
        "@/*": ["./*"],
      },
    },
    include: ["pages/**/*", "blocks/**/*", "sources/**/*"],
    exclude: ["node_modules", ".hands"],
  }
  await Bun.write(join(targetDir, "tsconfig.json"), JSON.stringify(tsConfig, null, 2) + "\n")
  console.log("  Created: tsconfig.json")

  // Create .gitignore
  const gitignore = `# Dependencies
node_modules/

# Build output
.hands/

# Database
db/

# Logs
*.log

# Environment
.env
.env.local
`
  await Bun.write(join(targetDir, ".gitignore"), gitignore)
  console.log("  Created: .gitignore")

  // Create biome.json for formatting
  const biomeConfig = {
    $schema: "https://biomejs.dev/schemas/1.9.0/schema.json",
    organizeImports: { enabled: true },
    linter: {
      enabled: true,
      rules: { recommended: true },
    },
    formatter: {
      enabled: true,
      indentStyle: "space",
      indentWidth: 2,
    },
  }
  await Bun.write(join(targetDir, "biome.json"), JSON.stringify(biomeConfig, null, 2) + "\n")
  console.log("  Created: biome.json")

  console.log()
  console.log("Done! Next steps:")
  console.log(`  cd ${slug}`)
  console.log("  bun install")
  console.log("  hands dev")
  console.log()
  console.log("Optional:")
  console.log("  hands add source hackernews  # Add a data source")
  console.log("  hands build                  # Build for production")
}
