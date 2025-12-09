#!/usr/bin/env bun
/**
 * Hands CLI
 *
 * Usage:
 *   hands dev                   Start the development server
 *   hands build                 Build for production
 *   hands new <name>            Create a new workbook
 *   hands add source <name>     Add a source from the registry
 *   hands sources               List available sources
 */

import { Command } from "commander"
import { devCommand } from "./commands/dev.js"
import { buildCommand } from "./commands/build.js"
import { newCommand } from "./commands/new.js"
import { addCommand } from "./commands/add.js"
import { sourcesCommand } from "./commands/sources.js"

const program = new Command()

program
  .name("hands")
  .description("Hands - Data analysis workbook CLI")
  .version("0.1.0")

program
  .command("dev")
  .description("Start the development server")
  .option("-p, --port <port>", "Runtime port", parseInt)
  .option("--no-hmr", "Disable hot module replacement")
  .action(devCommand)

program
  .command("build")
  .description("Build for production")
  .option("--no-check", "Skip code quality checks")
  .option("--no-fix", "Don't auto-fix formatting")
  .option("--json", "Output check results as JSON")
  .option("--strict", "Exit with error on any issue")
  .option("-v, --verbose", "Verbose output")
  .action(buildCommand)

program
  .command("new <name>")
  .description("Create a new workbook")
  .option("-t, --template <template>", "Template to use", "default")
  .action(newCommand)

program
  .command("add")
  .description("Add a component")
  .command("source <name>")
  .description("Add a source from the registry")
  .option("-s, --schedule <cron>", "Override cron schedule")
  .action(addCommand)

program
  .command("sources")
  .description("List available sources from the registry")
  .action(sourcesCommand)

program.parse()
