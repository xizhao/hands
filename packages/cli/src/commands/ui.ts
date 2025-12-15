import { spawn } from "child_process";
import pc from "picocolors";
import { findWorkbookRoot } from "../utils.js";

export async function uiCommand(command: string, args: string[]) {
  const workbookPath = await findWorkbookRoot();

  if (!workbookPath) {
    console.error(pc.red("Error: Not in a workbook directory"));
    process.exit(1);
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
