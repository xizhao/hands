#!/usr/bin/env bun
/**
 * Build CLI - standalone script for building workbooks
 *
 * Usage:
 *   bun build/cli.ts <workbook-dir> [--verbose]           # Dev build
 *   bun build/cli.ts <workbook-dir> --production [--verbose]  # Production build
 *   bun build/cli.ts <workbook-dir> --dev                 # Dev build (JSON output for subprocess)
 *
 * This is spawned by the runtime to avoid Bun 1.3.3 crash when Bun.build()
 * is called from a complex process with many modules loaded.
 */

import { build } from "./index.js"
import { buildProduction } from "./production.js"

async function main() {
  const args = process.argv.slice(2)

  if (args.length === 0) {
    console.error("Usage: bun build/cli.ts <workbook-dir> [--production] [--dev] [--verbose]")
    process.exit(1)
  }

  const workbookDir = args[0]
  const verbose = args.includes("--verbose")
  const production = args.includes("--production")
  const dev = args.includes("--dev")
  const skipPrerender = args.includes("--skip-prerender")

  if (production) {
    // Production build with static pre-rendering and optimizations
    console.log("Building for production...")

    const result = await buildProduction(workbookDir, {
      verbose,
      skipPrerender,
    })

    if (!result.success) {
      console.error("Production build failed:")
      for (const error of result.errors) {
        console.error(`  ${error}`)
      }
      process.exit(1)
    }

    console.log(`\nProduction build complete!`)
    console.log(`Output: ${result.outputDir}`)

    if (result.staticPages && result.staticPages.length > 0) {
      console.log(`\nPre-rendered pages: ${result.staticPages.length}`)
      if (verbose) {
        for (const page of result.staticPages) {
          console.log(`  ${page.route} -> _static/${page.file}`)
        }
      }
    }

    if (result.stats) {
      console.log(`\nBundle stats:`)
      console.log(`  Worker: ${(result.stats.workerSize / 1024).toFixed(1)} KB`)
      console.log(`  Static: ${(result.stats.staticSize / 1024).toFixed(1)} KB`)
      console.log(`  Total:  ${(result.stats.totalSize / 1024).toFixed(1)} KB`)
    }

    console.log(`\nDeploy with: cd ${result.outputDir} && wrangler deploy`)
  } else if (dev) {
    // Development build (called by runtime as subprocess)
    // Output JSON result for parent process to parse
    const result = await build(workbookDir, { dev: true, verbose })

    // Output JSON on last line for parent process to parse
    console.log(JSON.stringify(result))

    process.exit(result.success ? 0 : 1)
  } else {
    // Development build (interactive)
    const result = await build(workbookDir, { dev: false, verbose })

    if (!result.success) {
      console.error("Build failed:")
      for (const error of result.errors) {
        console.error(`  ${error}`)
      }
      process.exit(1)
    }

    console.log(`Generated ${result.files.length} files in ${result.outputDir}`)

    if (verbose && result.pages) {
      console.log(`\nPages: ${result.pages.length}`)
      for (const page of result.pages) {
        console.log(`  ${page.route} -> ${page.path}`)
      }
    }

    if (verbose && result.blocks) {
      console.log(`\nBlocks: ${result.blocks.length}`)
      for (const block of result.blocks) {
        console.log(`  ${block.id}`)
      }
    }
  }
}

main().catch((error) => {
  console.error("Fatal error:", error)
  process.exit(1)
})
