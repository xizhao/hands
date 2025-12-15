import { spawn } from "child_process";
import pc from "picocolors";
import { findWorkbookRoot } from "../utils.js";

interface UiOptions {
  registry?: string;
}

export async function uiCommand(command: string, args: string[], options: UiOptions) {
  const workbookPath = await findWorkbookRoot();

  if (!workbookPath) {
    console.error(pc.red("Error: Not in a workbook directory"));
    process.exit(1);
  }

  // Build shadcn args
  const shadcnArgs = [command];

  // Add registry flag if specified
  if (options.registry) {
    shadcnArgs.push("-r", options.registry);
  }

  // Add remaining args
  shadcnArgs.push(...args);

  console.log(pc.dim(`Running: bunx shadcn@latest ${shadcnArgs.join(" ")}`));

  const child = spawn("bunx", ["shadcn@latest", ...shadcnArgs], {
    cwd: workbookPath,
    stdio: "inherit",
  });

  child.on("exit", (code) => {
    process.exit(code ?? 0);
  });
}
