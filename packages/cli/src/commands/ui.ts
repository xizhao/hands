import { spawn } from "node:child_process";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import pc from "picocolors";
import { findWorkbookRoot } from "../utils.js";

/**
 * Fix common shadcn config issues before running commands.
 * - Renames @ui folder to ui (shadcn doesn't understand path aliases)
 * - Fixes components.json aliases from @ui to ui
 */
function fixShadcnConfig(workbookPath: string): boolean {
  let fixed = false;

  // Fix @ui folder -> ui
  const atUiPath = path.join(workbookPath, "@ui");
  const uiPath = path.join(workbookPath, "ui");

  if (existsSync(atUiPath)) {
    if (existsSync(uiPath)) {
      console.error(pc.red("Error: Both @ui/ and ui/ folders exist. Please merge them manually."));
      process.exit(1);
    }
    renameSync(atUiPath, uiPath);
    console.log(pc.yellow("  Fixed: Renamed @ui/ → ui/"));
    fixed = true;
  }

  // Fix components.json aliases
  const componentsPath = path.join(workbookPath, "components.json");
  if (existsSync(componentsPath)) {
    try {
      const content = readFileSync(componentsPath, "utf-8");
      const config = JSON.parse(content);

      if (config.aliases) {
        let aliasesFixed = false;
        const fixedAliases: Record<string, string> = {};

        for (const [key, value] of Object.entries(config.aliases)) {
          if (typeof value === "string" && value.startsWith("@ui")) {
            // Replace @ui with ui (e.g., @ui/lib/utils -> ui/lib/utils)
            fixedAliases[key] = value.replace(/^@ui/, "ui");
            aliasesFixed = true;
          } else {
            fixedAliases[key] = value as string;
          }
        }

        if (aliasesFixed) {
          config.aliases = fixedAliases;
          writeFileSync(componentsPath, `${JSON.stringify(config, null, 2)}\n`);
          console.log(pc.yellow("  Fixed: Updated components.json aliases (@ui → ui)"));
          fixed = true;
        }
      }
    } catch (_err) {
      // Ignore parse errors, shadcn will report them
    }
  }

  return fixed;
}

export async function uiCommand(command: string, args: string[]) {
  const workbookPath = await findWorkbookRoot();

  if (!workbookPath) {
    console.error(pc.red("Error: Not in a workbook directory"));
    process.exit(1);
  }

  // Preflight: fix common config issues
  const wasFixed = fixShadcnConfig(workbookPath);
  if (wasFixed) {
    console.log("");
  }

  // Pass everything through to shadcn
  const shadcnArgs = [command, ...args];

  console.log(pc.dim(`Running: bunx shadcn@latest ${shadcnArgs.join(" ")}`));

  const child = spawn("bunx", ["shadcn@latest", ...shadcnArgs], {
    cwd: workbookPath,
    stdio: "inherit",
  });

  child.on("exit", (code) => {
    process.exit(code ?? 0);
  });
}
