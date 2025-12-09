#!/usr/bin/env bun
/**
 * Build CLI - standalone script for building workbooks
 *
 * Usage: bun build/cli.ts <workbook-dir> [--verbose]
 *
 * This is spawned by the CLI package to avoid workspace dependency issues.
 */

import { build } from "./index.js"

async function main() {
  const args = process.argv.slice(2)

  if (args.length === 0) {
    console.error("Usage: bun build/cli.ts <workbook-dir> [--verbose]")
    process.exit(1)
  }

  const workbookDir = args[0]
  const verbose = args.includes("--verbose")

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

main().catch((error) => {
  console.error("Fatal error:", error)
  process.exit(1)
})
