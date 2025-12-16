import { program } from "commander";
import { devCommand } from "./commands/dev.js";
import { initCommand } from "./commands/init.js";
import { checkCommand } from "./commands/check.js";
import { fmtCommand } from "./commands/fmt.js";
import { uiCommand } from "./commands/ui.js";

const DESCRIPTION = `Workbook development tool`;

program
  .name("hands")
  .description(DESCRIPTION)
  .version("1.0.0");

program
  .command("dev")
  .description("Start development server")
  .action(devCommand);

program
  .command("init")
  .description("Initialize a new workbook")
  .argument("[name]", "Workbook name (uses current directory if omitted)")
  .action(initCommand);

program
  .command("check")
  .description("Validate workbook configuration")
  .option("--fix", "Auto-fix issues")
  .action(checkCommand);

program
  .command("fmt")
  .description("Format workbook files with Biome and add RSC directives")
  .action(fmtCommand);

// UI components - proxy to shadcn
program
  .command("ui")
  .description("Manage UI components (proxies to shadcn)")
  .argument("<command>", "shadcn command: add, diff, search, init")
  .argument("[args...]", "Arguments passed to shadcn")
  .allowUnknownOption()
  .action(uiCommand);

program.parse();
