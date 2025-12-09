/**
 * Shared utilities for CLI commands
 *
 * This is the CLI's own config schema.
 * We keep this separate to avoid runtime dependencies.
 */

import { z } from "zod"

// Source configuration in hands.json
export const SourceConfigSchema = z.object({
  enabled: z.boolean().default(true),
  schedule: z.string().optional(),
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
export async function loadHandsJson(workbookDir: string): Promise<HandsJson> {
  const path = `${workbookDir}/hands.json`

  try {
    const file = Bun.file(path)
    const exists = await file.exists()

    if (!exists) {
      throw new Error(`hands.json not found at ${path}`)
    }

    const content = await file.json()
    return HandsJsonSchema.parse(content)
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n")
      throw new Error(`Invalid hands.json:\n${issues}`)
    }
    throw error
  }
}

/**
 * Save hands.json to a workbook directory
 */
export async function saveHandsJson(workbookDir: string, config: HandsJson): Promise<void> {
  const path = `${workbookDir}/hands.json`
  const content = JSON.stringify(config, null, 2)
  await Bun.write(path, content + "\n")
}

/**
 * Create a default hands.json for a new workbook
 */
export function createDefaultHandsJson(name: string): HandsJson {
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
