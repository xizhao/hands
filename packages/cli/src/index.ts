import { program } from "commander";
import { devCommand } from "./commands/dev.js";
import { initCommand } from "./commands/init.js";
import { checkCommand } from "./commands/check.js";
import { uiCommand } from "./commands/ui.js";

const DESCRIPTION = `
Hands CLI - workbook development tool

Hands workbooks are data analysis projects containing:
  - ui/       Reusable UI components (shadcn/ui). Import via @ui
  - blocks/   Data visualization blocks (React Server Components). Import via @/blocks
  - pages/    Markdown/MDX documentation pages

Workbook Structure:
  workbook/
    package.json      Dependencies and hands config
    components.json   shadcn/ui configuration (aliases, styles, registry)
    ui/               UI components installed via 'hands ui add'
    blocks/           Your data blocks (server components by default)
    pages/            Markdown pages rendered via PlateStatic
    .hands/           Generated files (gitignored)

Aliases available in code:
  @ui         → workbook/ui/        (shadcn components)
  @/blocks    → workbook/blocks/    (your blocks)
  @hands/db   → database client     (Kysely)
  @hands/pages → generated routes

Examples:
  hands init my-analysis        Create new workbook
  hands ui add button card      Add shadcn components
  hands ui search chart         Search for components
  hands dev                     Start dev server
`.trim();

program
  .name("hands")
  .description(DESCRIPTION)
  .version("1.0.0");

program
  .command("dev")
  .description(`Start the development server for the current workbook.

Runs preflight checks, then starts Vite dev server with:
  - Hot module reloading for blocks and UI
  - Server-side rendering for blocks
  - Automatic page generation from markdown

The server runs at http://localhost:5173 by default.
Blocks are available at /blocks/<name>
Pages are available at /pages/<name>`)
  .action(devCommand);

program
  .command("init")
  .description(`Initialize a new workbook with standard structure.

Creates:
  package.json      For workbook dependencies
  components.json   shadcn/ui config with @ui aliases
  ui/               For shadcn components (hands ui add)
  ui/lib/utils.ts   cn() utility for class merging
  ui/styles.css     Tailwind CSS entry point
  blocks/           For your data blocks
  pages/            For markdown documentation
  .hands/           Generated files (auto-gitignored)
  .gitignore        Ignores node_modules and .hands

Example:
  hands init my-analysis
  cd my-analysis
  bun install
  hands ui add button card table
  hands dev`)
  .argument("[name]", "Workbook name (uses current directory if omitted)")
  .action(initCommand);

program
  .command("check")
  .description(`Validate workbook configuration and structure.

Checks:
  - package.json exists and is valid JSON
  - node_modules installed (prompts to run bun install)
  - Required directories exist (creates if missing)
  - .hands directory for generated files

Run this to diagnose issues before 'hands dev'.`)
  .action(checkCommand);

// UI components - proxy to shadcn
program
  .command("ui")
  .description(`Manage UI components via shadcn/ui CLI.

This proxies to 'bunx shadcn@latest' using your workbook's
components.json configuration. Components install to ui/
and can be imported via @ui alias.

Commands (passed to shadcn):
  add <components...>   Install components (by name, URL, or path)
  diff <component>      Show changes between local and registry version
  search <@registry>    Search registry for components (-q for query)
  init                  Re-initialize shadcn config

Adding Components:
  By name (from default registry):
    hands ui add button card dialog

  By URL (from any registry):
    hands ui add "https://magicui.design/r/shimmer-button"
    hands ui add "https://ui.aceternity.com/r/3d-card"

Searching Registries:
  Registries must be prefixed with @ or be a URL:
    hands ui search @shadcn                    List all from shadcn
    hands ui search @shadcn -q button          Search for "button"
    hands ui search https://magicui.design     Search magicui

Popular Registries:
  @shadcn                    https://ui.shadcn.com (default)
  https://magicui.design     Magic UI components
  https://ui.aceternity.com  Aceternity UI
  https://ui.lukacho.com     Lukacho UI

After adding, import in your blocks:
  import { Button } from "@ui/button"
  import { Card } from "@ui/card"`)
  .argument("<command>", "shadcn command: add, diff, search, init")
  .argument("[args...]", "Arguments (components, registries, flags)")
  .allowUnknownOption()
  .action(uiCommand);

program.parse();
