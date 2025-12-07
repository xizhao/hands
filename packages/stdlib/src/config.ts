import { z } from "zod"

export const HandsConfigSchema = z.object({
  name: z.string(),

  database: z
    .object({
      connectionString: z.string().optional(),
    })
    .optional(),

  monitors: z
    .record(
      z.string(),
      z.object({
        schedule: z.string(), // e.g., "rate(5 minutes)" or "cron(0 * * * *)"
        handler: z.string(),
        timeout: z.number().optional(),
        memory: z.number().optional(),
      })
    )
    .optional(),

  dashboards: z
    .record(
      z.string(),
      z.object({
        title: z.string(),
        handler: z.string(),
        auth: z.boolean().optional(),
      })
    )
    .optional(),

  integrations: z
    .record(
      z.string(),
      z.object({
        type: z.enum(["webhook", "polling", "stream"]),
        handler: z.string(),
        schedule: z.string().optional(), // For polling integrations
      })
    )
    .optional(),
})

export type HandsConfig = z.infer<typeof HandsConfigSchema>

export function defineConfig(config: HandsConfig): HandsConfig {
  return HandsConfigSchema.parse(config)
}
