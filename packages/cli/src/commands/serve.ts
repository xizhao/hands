import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import pc from "picocolors";
import { findWorkbookRoot } from "../utils.js";

interface ServeOptions {
  port?: string;
}

export async function serveCommand(options: ServeOptions) {
  const workbookPath = await findWorkbookRoot();

  if (!workbookPath) {
    console.error(pc.red("Error: Not in a workbook directory"));
    console.error(
      "Run this command from a workbook root (contains package.json with hands config)",
    );
    process.exit(1);
  }

  const distDir = path.join(workbookPath, ".hands/dist");
  const workerDir = path.join(distDir, "worker");

  // Check that build output exists
  if (!existsSync(workerDir)) {
    console.error(pc.red("Error: Build output not found"));
    console.error(`Expected at: ${workerDir}`);
    console.error(pc.dim("Run `hands build` first to create the production build."));
    process.exit(1);
  }

  const port = options.port ?? "8787";
  console.log(pc.blue(`Starting production server on port ${port}...`));
  console.log(pc.dim(`Serving from: ${workerDir}`));

  // Persist state to the workbook's .hands/db directory
  const persistPath = path.join(workbookPath, ".hands/db");

  // Use wrangler from runtime package
  const runtimeDir = path.resolve(import.meta.dirname, "../../../runtime");
  const wranglerBin = path.join(runtimeDir, "node_modules/.bin/wrangler");

  const child = spawn(wranglerBin, ["dev", "--port", port, "--persist-to", persistPath], {
    cwd: workerDir,
    env: {
      ...process.env,
      NODE_ENV: "production",
    },
    stdio: "inherit",
  });

  child.on("exit", (code) => {
    process.exit(code ?? 0);
  });
}
