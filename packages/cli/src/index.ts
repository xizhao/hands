import { program } from "commander";
import pc from "picocolors";
import { devCommand } from "./commands/dev.js";
import { addCommand } from "./commands/add.js";
import { initCommand } from "./commands/init.js";
import { checkCommand } from "./commands/check.js";
import { libupdateCommand } from "./commands/libupdate.js";

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
  .command("add")
  .description("Add components from registry")
  .argument("<components...>", "Components to add")
  .option("-r, --registry <url>", "Registry URL")
  .action(addCommand);

program
  .command("libupdate")
  .description("Update installed components")
  .argument("[components...]", "Components to update (all if empty)")
  .action(libupdateCommand);

program
  .command("check")
  .description("Validate workbook configuration")
  .action(checkCommand);

program.parse();
