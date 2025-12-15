import { spawn } from "child_process";
import path from "path";
import pc from "picocolors";
import { preflight } from "../preflight.js";
import { findWorkbookRoot } from "../utils.js";

export async function devCommand() {
  const workbookPath = await findWorkbookRoot();

  if (!workbookPath) {
    console.error(pc.red("Error: Not in a workbook directory"));
    console.error("Run this command from a workbook root (contains package.json with hands config)");
    process.exit(1);
  }

  console.log(pc.blue(`Starting dev server for ${pc.bold(path.basename(workbookPath))}...`));

  // Run preflight checks
  const preflightOk = await preflight(workbookPath);
  if (!preflightOk) {
    process.exit(1);
  }

  // Find runtime package
  const runtimeDir = path.resolve(import.meta.dirname, "../../../runtime");

  const child = spawn("npx", ["vite", "dev"], {
    cwd: runtimeDir,
    env: {
      ...process.env,
      HANDS_WORKBOOK_PATH: workbookPath,
      NODE_ENV: "development",
    },
    stdio: "inherit",
  });

  child.on("exit", (code) => {
    process.exit(code ?? 0);
  });
}
