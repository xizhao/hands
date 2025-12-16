import { spawn } from "child_process";
import path from "path";
import pc from "picocolors";
import { preflight } from "../preflight.js";
import { findWorkbookRoot } from "../utils.js";

export async function deployCommand() {
  const workbookPath = await findWorkbookRoot();

  if (!workbookPath) {
    console.error(pc.red("Error: Not in a workbook directory"));
    console.error("Run this command from a workbook root (contains package.json with hands config)");
    process.exit(1);
  }

  console.log(pc.blue(`Deploying ${pc.bold(path.basename(workbookPath))}...`));

  // Run preflight checks
  const preflightOk = await preflight(workbookPath);
  if (!preflightOk) {
    process.exit(1);
  }

  // Find runtime package
  const runtimeDir = path.resolve(import.meta.dirname, "../../../runtime");

  // Use rwsdk's release script which handles:
  // 1. ensure-deploy-env (validates wrangler config)
  // 2. clean (removes .vite cache)
  // 3. build (vite build)
  // 4. wrangler deploy
  const child = spawn("bun", ["run", "release"], {
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
      console.log(pc.green("\nDeployment complete!"));
    }
    process.exit(code ?? 0);
  });
}
