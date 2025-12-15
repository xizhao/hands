import { program } from "commander";
import { devCommand } from "./commands/dev.js";
import { initCommand } from "./commands/init.js";
import { checkCommand } from "./commands/check.js";
import { uiCommand } from "./commands/ui.js";
import { sourceCommand } from "./commands/source.js";
import { blockCommand } from "./commands/block.js";

program
  .name("hands")
  .description("Hands CLI - workbook development tool")
  .version("1.0.0");

program
  .command("dev")
  .description("Start development server")
  .action(devCommand);

program
  .command("init")
  .description("Initialize a new workbook")
  .argument("[name]", "Workbook name")
  .action(initCommand);

program
  .command("check")
  .description("Validate workbook configuration")
  .action(checkCommand);

// UI components - proxy to shadcn
program
  .command("ui")
  .description("UI components (proxies to shadcn)")
  .argument("<command>", "shadcn command: add, diff, etc.")
  .argument("[args...]", "Command arguments")
  .allowUnknownOption()
  .action(uiCommand);

// Data sources
const source = program
  .command("source")
  .description("Manage data sources");

source
  .command("add")
  .description("Add a data source")
  .argument("<type>", "Source type: csv, json, api, etc.")
  .argument("[path]", "Path or URL")
  .action(sourceCommand.add);

source
  .command("list")
  .description("List configured sources")
  .action(sourceCommand.list);

source
  .command("sync")
  .description("Sync data from sources")
  .argument("[name]", "Source name (all if empty)")
  .action(sourceCommand.sync);

// Block templates
const block = program
  .command("block")
  .description("Manage blocks");

block
  .command("add")
  .description("Add a block from template")
  .argument("<name>", "Block template name")
  .action(blockCommand.add);

block
  .command("list")
  .description("List available block templates")
  .action(blockCommand.list);

program.parse();
