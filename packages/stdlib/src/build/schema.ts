import { z } from "zod"

/**
 * hands.json schema - single source of truth for workbook configuration
 */

// Source configuration in hands.json
export const SourceConfigSchema = z.object({
  enabled: z.boolean().default(true),
  schedule: z.string().optional(), // Cron expression, overrides source default
  options: z.record(z.unknown()).optional(), // Source-specific options
})

// Secret requirement
export const SecretSchema = z.object({
  required: z.boolean().default(true),
  description: z.string().optional(),
})

// Database configuration
export const DatabaseConfigSchema = z.object({
  migrations: z.string().default("./migrations"),
})

// Build configuration
export const BuildConfigSchema = z.object({
  outDir: z.string().default(".hands"),
})

// Full hands.json schema
export const HandsJsonSchema = z.object({
  $schema: z.string().optional(),
  name: z.string(),
  version: z.string().default("0.1.0"),

  // Sources configuration
  sources: z.record(z.string(), SourceConfigSchema).default({}),

  // Required secrets
  secrets: z.record(z.string(), SecretSchema).default({}),

  // Database settings
  database: DatabaseConfigSchema.default({}),

  // Build settings
  build: BuildConfigSchema.default({}),
})

export type HandsJson = z.infer<typeof HandsJsonSchema>
export type SourceConfig = z.infer<typeof SourceConfigSchema>
export type SecretConfig = z.infer<typeof SecretSchema>
export type DatabaseConfig = z.infer<typeof DatabaseConfigSchema>
export type BuildConfig = z.infer<typeof BuildConfigSchema>

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
    name,
    version: "0.1.0",
    sources: {},
    secrets: {},
    database: { migrations: "./migrations" },
    build: { outDir: ".hands" },
  }
}
