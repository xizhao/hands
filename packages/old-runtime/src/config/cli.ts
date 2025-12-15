#!/usr/bin/env bun
/**
 * CLI entry point for workbook configuration commands.
 * Called by Tauri and can be used standalone.
 *
 * Usage:
 *   bun run packages/runtime/src/config/cli.ts init --name="My Workbook" --dir="/path/to/workbook"
 */

import { initWorkbook } from "./index.js";

function parseArgs(): { command: string; name?: string; dir?: string } {
  const args: Record<string, string> = {};
  let command = "";

  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--")) {
      const [key, value] = arg.slice(2).split("=");
      args[key] = value;
    } else if (!command) {
      command = arg;
    }
  }

  return {
    command,
    name: args.name,
    dir: args.dir,
  };
}

async function main() {
  const { command, name, dir } = parseArgs();

  if (command === "init") {
    if (!name || !dir) {
      console.error("Usage: init --name=<name> --dir=<directory>");
      process.exit(1);
    }

    try {
      await initWorkbook({ name, directory: dir });
      console.log(JSON.stringify({ success: true }));
    } catch (err) {
      console.error(
        JSON.stringify({
          success: false,
          error: err instanceof Error ? err.message : String(err),
        }),
      );
      process.exit(1);
    }
  } else {
    console.error(`Unknown command: ${command}`);
    console.error("Available commands: init");
    process.exit(1);
  }
}

main();
