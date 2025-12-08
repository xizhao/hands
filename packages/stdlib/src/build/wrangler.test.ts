import { describe, test, expect } from "bun:test"
import { generateWranglerToml } from "./wrangler"
import type { HandsJson } from "./schema"

describe("generateWranglerToml", () => {
  test("generates basic wrangler.toml", () => {
    const config: HandsJson = {
      name: "test-workbook",
      version: "0.1.0",
      sources: {},
      secrets: {},
      database: { migrations: "./migrations" },
      build: { outDir: ".hands" },
    }

    const result = generateWranglerToml(config)

    expect(result).toContain('name = "test-workbook"')
    expect(result).toContain('main = "worker.ts"')
    expect(result).toContain('compatibility_date = "2024-01-01"')
    expect(result).toContain('compatibility_flags = ["nodejs_compat"]')
    expect(result).toContain("[vars]")
    expect(result).toContain('ENVIRONMENT = "production"')
  })

  test("generates dev mode wrangler.toml", () => {
    const config: HandsJson = {
      name: "dev-workbook",
      version: "0.1.0",
      sources: {},
      secrets: {},
      database: { migrations: "./migrations" },
      build: { outDir: ".hands" },
    }

    const result = generateWranglerToml(config, { dev: true })

    expect(result).toContain('ENVIRONMENT = "development"')
    expect(result).toContain("[dev]")
    expect(result).toContain("port = 8787")
    expect(result).toContain('local_protocol = "http"')
  })

  test("includes cron triggers for enabled sources", () => {
    const config: HandsJson = {
      name: "cron-workbook",
      version: "0.1.0",
      sources: {
        "test-source": {
          enabled: true,
          schedule: "*/5 * * * *",
        },
      },
      secrets: {},
      database: { migrations: "./migrations" },
      build: { outDir: ".hands" },
    }

    const result = generateWranglerToml(config)

    expect(result).toContain("[triggers]")
    expect(result).toContain('"*/5 * * * *"')
  })

  test("does not include cron triggers for disabled sources", () => {
    const config: HandsJson = {
      name: "no-cron-workbook",
      version: "0.1.0",
      sources: {
        "disabled-source": {
          enabled: false,
          schedule: "*/5 * * * *",
        },
      },
      secrets: {},
      database: { migrations: "./migrations" },
      build: { outDir: ".hands" },
    }

    const result = generateWranglerToml(config)

    expect(result).not.toContain("[triggers]")
    expect(result).not.toContain("*/5 * * * *")
  })

  test("deduplicates cron schedules", () => {
    const config: HandsJson = {
      name: "dedup-workbook",
      version: "0.1.0",
      sources: {
        "source1": {
          enabled: true,
          schedule: "0 * * * *",
        },
        "source2": {
          enabled: true,
          schedule: "0 * * * *",
        },
      },
      secrets: {},
      database: { migrations: "./migrations" },
      build: { outDir: ".hands" },
    }

    const result = generateWranglerToml(config)

    // Should only have one instance of the cron
    const matches = result.match(/"0 \* \* \* \*"/g)
    expect(matches?.length).toBe(1)
  })

  test("documents required secrets", () => {
    const config: HandsJson = {
      name: "secrets-workbook",
      version: "0.1.0",
      sources: {},
      secrets: {
        API_KEY: {
          required: true,
          description: "API key for external service",
        },
        OPTIONAL_TOKEN: {
          required: false,
          description: "Optional auth token",
        },
      },
      database: { migrations: "./migrations" },
      build: { outDir: ".hands" },
    }

    const result = generateWranglerToml(config)

    expect(result).toContain("# API_KEY (required) - API key for external service")
    expect(result).toContain("# OPTIONAL_TOKEN (optional) - Optional auth token")
  })

  test("generates valid TOML syntax", () => {
    const config: HandsJson = {
      name: "valid-toml-test",
      version: "0.1.0",
      sources: {
        "source1": {
          enabled: true,
          schedule: "*/15 * * * *",
        },
      },
      secrets: {
        API_KEY: {
          required: true,
        },
      },
      database: { migrations: "./migrations" },
      build: { outDir: ".hands" },
    }

    const result = generateWranglerToml(config, { dev: true })

    // Check no unresolved placeholders
    expect(result).not.toMatch(/\{\{.*\}\}/)

    // Basic TOML structure checks
    expect(result).toContain("# Auto-generated")
    expect(result).toMatch(/^name = "/m)
    expect(result).toMatch(/^main = "/m)
    expect(result).toMatch(/^compatibility_date = "/m)

    // Check for common TOML syntax issues
    // No unquoted strings with spaces
    expect(result).not.toMatch(/^[a-z_]+ [^=]/m) // Unquoted value after key

    // All key = value lines should have proper quoting for string values
    const keyValueLines = result.split("\n").filter(line =>
      line.match(/^[a-z_]+ = /) && !line.startsWith("#")
    )
    for (const line of keyValueLines) {
      // Values should be properly quoted strings, arrays, or booleans
      expect(line).toMatch(/= (".*"|true|false|\[.*\]|\d+)$/)
    }
  })
})
