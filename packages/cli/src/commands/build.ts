import { spawn } from "child_process";
import path from "path";
import pc from "picocolors";
import { preflight } from "../preflight.js";
import { findWorkbookRoot } from "../utils.js";

export async function buildCommand() {
  const workbookPath = await findWorkbookRoot();

  if (!workbookPath) {
    console.error(pc.red("Error: Not in a workbook directory"));
    console.error("Run this command from a workbook root (contains package.json with hands config)");
    process.exit(1);
  }

  console.log(pc.blue(`Building ${pc.bold(path.basename(workbookPath))}...`));

  // Run preflight checks
  const preflightOk = await preflight(workbookPath);
  if (!preflightOk) {
    process.exit(1);
  }

  // Find runtime package
  const runtimeDir = path.resolve(import.meta.dirname, "../../../runtime");
  const outputDir = path.join(workbookPath, ".hands/dist");

  console.log(pc.dim(`Output: ${outputDir}`));

  const child = spawn("npx", ["vite", "build"], {
    cwd: runtimeDir,
    env: {
      ...process.env,
      HANDS_WORKBOOK_PATH: workbookPath,
      NODE_ENV: "production",
    },
    stdio: "inherit",
  });

  child.on("exit", (code) => {
    if (code === 0) {
      console.log(pc.green(`\nBuild complete! Output: ${outputDir}`));
      console.log(pc.dim("Run `hands serve` to test locally, or `hands deploy` to deploy."));
    }
    process.exit(code ?? 0);
  });
}
