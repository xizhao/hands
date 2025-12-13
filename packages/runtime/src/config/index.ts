/**
 * Configuration types and validation for hands.json
 *
 * This is the single source of truth for workbook configuration.
 * CLI and other packages should import from here.
 */

import { z } from "zod"
import {
  existsSync,
  readFileSync,
  writeFileSync,
  symlinkSync,
  lstatSync,
  unlinkSync,
  readlinkSync,
  mkdirSync,
  realpathSync,
} from "fs"
import { join, resolve } from "path"
import { homedir } from "os"

/**
 * Get the ~/.hands directory path
 */
export function getHandsDir(): string {
  return join(homedir(), ".hands")
}

/**
 * Get the path to the stdlib symlink in ~/.hands/stdlib
 */
export function getStdlibSymlinkPath(): string {
  return join(getHandsDir(), "stdlib")
}

/**
 * Get the actual path to @hands/stdlib source
 * Works in both development (monorepo) and production
 * Resolves symlinks to get the real path
 */
export function getStdlibSourcePath(): string {
  // In development, stdlib is a sibling package in packages/stdlib
  // From src/config/index.ts -> ../../../stdlib = packages/stdlib
  const devPath = resolve(import.meta.dir, "../../../stdlib")
  if (existsSync(join(devPath, "package.json"))) {
    // Resolve any symlinks to get the real absolute path
    try {
      return realpathSync(devPath)
    } catch {
      return devPath
    }
  }
  // Fallback: check relative to runtime package root
  const runtimeRoot = resolve(import.meta.dir, "../..")
  const altDevPath = resolve(runtimeRoot, "../stdlib")
  if (existsSync(join(altDevPath, "package.json"))) {
    try {
      return realpathSync(altDevPath)
    } catch {
      return altDevPath
    }
  }
  // Last resort: node_modules (but use import.meta.dir, not cwd)
  const nodeModulesPath = resolve(import.meta.dir, "../../node_modules/@hands/stdlib")
  try {
    return realpathSync(nodeModulesPath)
  } catch {
    return nodeModulesPath
  }
}

/**
 * Get the actual path to @hands/editor source
 * Works in both development (monorepo) and production
 */
export function getEditorSourcePath(): string {
  // In development, editor is a sibling package in packages/editor
  const devPath = resolve(import.meta.dir, "../../../editor")
  if (existsSync(join(devPath, "package.json"))) {
    try {
      return realpathSync(devPath)
    } catch {
      return devPath
    }
  }
  // Fallback: check relative to runtime package root
  const runtimeRoot = resolve(import.meta.dir, "../..")
  const altDevPath = resolve(runtimeRoot, "../editor")
  if (existsSync(join(altDevPath, "package.json"))) {
    try {
      return realpathSync(altDevPath)
    } catch {
      return altDevPath
    }
  }
  // Last resort: node_modules
  const nodeModulesPath = resolve(import.meta.dir, "../../node_modules/@hands/editor")
  try {
    return realpathSync(nodeModulesPath)
  } catch {
    return nodeModulesPath
  }
}

/**
 * Ensure the stdlib symlink exists at ~/.hands/stdlib
 * Creates or updates it to point to the correct source
 */
export function ensureStdlibSymlink(): string {
  const handsDir = getHandsDir()
  const symlinkPath = getStdlibSymlinkPath()
  const sourcePath = getStdlibSourcePath()

  // Ensure ~/.hands directory exists
  if (!existsSync(handsDir)) {
    mkdirSync(handsDir, { recursive: true })
  }

  // Check if symlink already exists (use lstat to detect broken symlinks too)
  try {
    const stat = lstatSync(symlinkPath)
    if (stat.isSymbolicLink()) {
      const currentTarget = readlinkSync(symlinkPath)
      if (currentTarget === sourcePath) {
        // Symlink already correct
        return symlinkPath
      }
      // Symlink points to wrong location, remove it
      unlinkSync(symlinkPath)
    } else {
      // It's a file or directory, remove it
      unlinkSync(symlinkPath)
    }
  } catch (e) {
    // ENOENT means nothing exists at path - that's fine, we'll create it
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
      // Some other error, try to remove and recreate
      try {
        unlinkSync(symlinkPath)
      } catch {
        // Ignore errors
      }
    }
  }

  // Create symlink
  try {
    symlinkSync(sourcePath, symlinkPath)
    console.log(`[config] Created stdlib symlink: ${symlinkPath} -> ${sourcePath}`)
  } catch (err) {
    console.error(`[config] Failed to create stdlib symlink:`, err)
  }

  return symlinkPath
}

/**
 * Ensure the workbook's node_modules/@hands/stdlib symlink exists and is correct.
 * This repairs broken or stale symlinks when loading a workbook.
 */
export function ensureWorkbookStdlibSymlink(workbookDir: string): void {
  const nodeModulesDir = join(workbookDir, "node_modules", "@hands")
  const symlinkPath = join(nodeModulesDir, "stdlib")
  const targetPath = getStdlibSymlinkPath() // ~/.hands/stdlib

  // Ensure the global stdlib symlink exists first
  ensureStdlibSymlink()

  // Ensure node_modules/@hands directory exists
  if (!existsSync(nodeModulesDir)) {
    mkdirSync(nodeModulesDir, { recursive: true })
  }

  // Check if symlink already exists (use lstat to detect broken symlinks too)
  try {
    const stat = lstatSync(symlinkPath)
    if (stat.isSymbolicLink()) {
      const currentTarget = readlinkSync(symlinkPath)
      if (currentTarget === targetPath) {
        // Symlink already correct
        return
      }
      // Symlink points to wrong location, remove it
      console.log(`[config] Fixing workbook stdlib symlink: ${currentTarget} -> ${targetPath}`)
      unlinkSync(symlinkPath)
    } else {
      // It's a file or directory, remove it
      unlinkSync(symlinkPath)
    }
  } catch (e) {
    // ENOENT means nothing exists at path - that's fine, we'll create it
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
      // Some other error, try to remove and recreate
      try {
        unlinkSync(symlinkPath)
      } catch {
        // Ignore errors
      }
    }
  }

  // Create symlink
  try {
    symlinkSync(targetPath, symlinkPath)
    console.log(`[config] Created workbook stdlib symlink: ${symlinkPath} -> ${targetPath}`)
  } catch (err) {
    // Only log if it's not EEXIST (which means it already exists and is fine)
    if ((err as NodeJS.ErrnoException).code !== "EEXIST") {
      console.error(`[config] Failed to create workbook stdlib symlink:`, err)
    }
  }
}

/**
 * Get the path to use for @hands/stdlib in workbook package.json
 * Uses the ~/.hands/stdlib symlink for portability
 */
function getStdlibPath(): string {
  // Ensure symlink exists and is correct
  ensureStdlibSymlink()
  return getStdlibSymlinkPath()
}

// Source configuration
export const SourceConfigSchema = z.object({
  /** Whether this source is enabled */
  enabled: z.boolean().default(true),
  /** Cron schedule for automatic sync (e.g., "0 *\/6 * * *" for every 6 hours) */
  schedule: z.string().optional(),
  /** Whether to sync automatically on schedule */
  autoSync: z.boolean().default(true),
  /** Whether to sync when runtime starts */
  syncOnStart: z.boolean().default(false),
  /** Source-specific options */
  options: z.record(z.unknown()).optional(),
})

// Secret requirement
export const SecretSchema = z.object({
  required: z.boolean().default(true),
  description: z.string().optional(),
})

// Pages configuration
export const PagesConfigSchema = z.object({
  dir: z.string().default("./pages"),
})

// Blocks configuration
export const BlocksConfigSchema = z.object({
  dir: z.string().default("./blocks"),
  include: z.array(z.string()).optional(),
  exclude: z.array(z.string()).optional(),
})

// Database configuration
export const DatabaseConfigSchema = z.object({
  migrations: z.string().default("./migrations"),
})

// Build configuration
export const BuildConfigSchema = z.object({
  outDir: z.string().default(".hands"),
  external: z.array(z.string()).optional(),
})

// Dev configuration
export const DevConfigSchema = z.object({
  port: z.number().optional(),
  hmr: z.boolean().default(true),
})

// Full hands.json schema
export const HandsJsonSchema = z.object({
  $schema: z.string().optional(),
  name: z.string(),
  version: z.string().default("0.1.0"),
  pages: PagesConfigSchema.default({}),
  blocks: BlocksConfigSchema.default({}),
  sources: z.record(z.string(), SourceConfigSchema).default({}),
  secrets: z.record(z.string(), SecretSchema).default({}),
  database: DatabaseConfigSchema.default({}),
  build: BuildConfigSchema.default({}),
  dev: DevConfigSchema.default({}),
})

// Export types
export type HandsJson = z.infer<typeof HandsJsonSchema>
export type SourceConfig = z.infer<typeof SourceConfigSchema>
export type SecretConfig = z.infer<typeof SecretSchema>
export type PagesConfig = z.infer<typeof PagesConfigSchema>
export type BlocksConfig = z.infer<typeof BlocksConfigSchema>
export type DatabaseConfig = z.infer<typeof DatabaseConfigSchema>
export type BuildConfig = z.infer<typeof BuildConfigSchema>
export type DevConfig = z.infer<typeof DevConfigSchema>

/**
 * Load and validate hands.json from a workbook directory
 */
export function loadConfig(workbookDir: string): HandsJson {
  const path = join(workbookDir, "hands.json")

  if (!existsSync(path)) {
    throw new Error(`hands.json not found at ${path}`)
  }

  try {
    const content = JSON.parse(readFileSync(path, "utf-8"))
    return HandsJsonSchema.parse(content)
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues
        .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
        .join("\n")
      throw new Error(`Invalid hands.json:\n${issues}`)
    }
    throw error
  }
}

/**
 * Save hands.json to a workbook directory
 */
export function saveConfig(workbookDir: string, config: HandsJson): void {
  const path = join(workbookDir, "hands.json")
  const content = JSON.stringify(config, null, 2)
  writeFileSync(path, content + "\n")
}

/**
 * Create a default hands.json for a new workbook
 */
export function createDefaultConfig(name: string): HandsJson {
  return {
    $schema: "https://hands.dev/schema/hands.json",
    name,
    version: "0.1.0",
    pages: { dir: "./pages" },
    blocks: { dir: "./blocks" },
    sources: {},
    secrets: {},
    database: { migrations: "./migrations" },
    build: { outDir: ".hands" },
    dev: { hmr: true },
  }
}

/**
 * Slugify a string for use as a workbook name
 */
export function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

// ============================================
// Workbook Initialization
// ============================================

export interface InitWorkbookOptions {
  /** Display name of the workbook */
  name: string
  /** Optional description */
  description?: string
  /** Target directory (must exist or will be created) */
  directory: string
}

/**
 * Initialize a new workbook with standard structure and starter files.
 * This is the single source of truth for workbook creation - used by CLI and desktop app.
 */
export async function initWorkbook(options: InitWorkbookOptions): Promise<void> {
  const { name, directory } = options
  const { mkdirSync, writeFileSync } = await import("fs")
  const { join } = await import("path")

  const slug = slugify(name)

  // Create directory structure
  mkdirSync(join(directory, "blocks"), { recursive: true })
  mkdirSync(join(directory, "blocks/ui"), { recursive: true })
  mkdirSync(join(directory, "pages"), { recursive: true })
  mkdirSync(join(directory, "migrations"), { recursive: true })
  mkdirSync(join(directory, "lib"), { recursive: true })
  mkdirSync(join(directory, "sources"), { recursive: true })

  // Create hands.json
  const handsJson: HandsJson = {
    $schema: "https://hands.dev/schema/hands.json",
    name: slug,
    version: "0.1.0",
    pages: { dir: "./pages" },
    blocks: { dir: "./blocks" },
    sources: {},
    secrets: {},
    database: { migrations: "./migrations" },
    build: { outDir: ".hands" },
    dev: { hmr: true },
  }
  writeFileSync(
    join(directory, "hands.json"),
    JSON.stringify(handsJson, null, 2) + "\n"
  )

  // Create package.json (using file: path for @hands/stdlib)
  const stdlibPath = getStdlibPath()
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
      "@hands/stdlib": `file:${stdlibPath}`,
    },
    devDependencies: {
      typescript: "^5",
    },
  }
  writeFileSync(
    join(directory, "package.json"),
    JSON.stringify(packageJson, null, 2) + "\n"
  )

  // Create tsconfig.json
  const tsconfig = {
    compilerOptions: {
      target: "ESNext",
      module: "ESNext",
      moduleResolution: "bundler",
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      jsx: "react-jsx",
      jsxImportSource: "react",
    },
    include: ["blocks/**/*", "pages/**/*", "lib/**/*"],
  }
  writeFileSync(
    join(directory, "tsconfig.json"),
    JSON.stringify(tsconfig, null, 2) + "\n"
  )

  // Create .gitignore
  const gitignore = `node_modules/
.hands/
db/
*.log
`
  writeFileSync(join(directory, ".gitignore"), gitignore)

  // Create blocks/welcome.tsx
  const welcomeBlock = `import type { BlockFn, BlockMeta } from "@hands/stdlib"

export const meta: BlockMeta = {
  title: "Welcome",
  description: "Welcome block for new workbooks",
  refreshable: false
}

const WelcomeBlock: BlockFn<{ name?: string }> = async ({ ctx, name }) => {
  // Query example using ctx.sql tagged template
  // const users = await ctx.sql<{ id: number; name: string }>\`
  //   SELECT id, name FROM users LIMIT 5
  // \`

  return (
    <div className="p-6 bg-gradient-to-br from-blue-50 to-indigo-100 rounded-xl">
      <h1 className="text-2xl font-bold text-gray-900">
        Welcome to {name || "${name}"}
      </h1>
      <p className="mt-2 text-gray-600">
        Create blocks to visualize your data.
      </p>
    </div>
  )
}

export default WelcomeBlock
`
  writeFileSync(join(directory, "blocks/welcome.tsx"), welcomeBlock)

  // Create blocks/ui/.gitkeep
  writeFileSync(join(directory, "blocks/ui/.gitkeep"), "")

  // Create pages/index.md
  const indexPage = `---
title: ${name}
---

# ${name}

<Block src="welcome" name="${name}" />

Start by creating blocks in the \`blocks/\` directory.
`
  writeFileSync(join(directory, "pages/index.md"), indexPage)

  // Create lib/db.ts helper
  const dbHelper = `// Database helper - re-exported from context for convenience
export type { SqlClient, BlockContext } from "@hands/stdlib"
`
  writeFileSync(join(directory, "lib/db.ts"), dbHelper)
}
