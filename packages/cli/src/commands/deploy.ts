import { spawnSync } from "node:child_process";
import path from "node:path";
import pc from "picocolors";
import { preflight } from "../preflight.js";
import { findWorkbookRoot } from "../utils.js";

/**
 * Run a command and wait for it to complete.
 * Returns true if successful, false otherwise.
 */
function runCommand(
  cmd: string,
  args: string[],
  opts: { cwd: string; env: Record<string, string | undefined> }
): boolean {
  const result = spawnSync(cmd, args, {
    cwd: opts.cwd,
    env: { ...process.env, ...opts.env },
    stdio: "inherit",
  });
  return result.status === 0;
}

export async function deployCommand() {
  const workbookPath = await findWorkbookRoot();

  if (!workbookPath) {
    console.error(pc.red("Error: Not in a workbook directory"));
    console.error(
      "Run this command from a workbook root (contains package.json with hands config)",
    );
    process.exit(1);
  }

  // Workbook-specific worker name for production
  // This ensures each workbook deploys to its own Cloudflare worker
  // Local dev always uses "runtime" from wrangler.jsonc (separate from prod)
  const workbookId = path.basename(workbookPath);
  const workerName = `hands-${workbookId}`;

  console.log(pc.blue(`Deploying ${pc.bold(workbookId)} as ${pc.bold(workerName)}...`));

  // Run preflight checks
  const preflightOk = await preflight(workbookPath);
  if (!preflightOk) {
    process.exit(1);
  }

  // Find runtime package
  const runtimeDir = path.resolve(import.meta.dirname, "../../../runtime");

  const env = {
    HANDS_WORKBOOK_PATH: workbookPath,
    NODE_ENV: "production",
  };

  // Step 1: Run ensure-deploy-env (validates wrangler config, sets up secrets)
  console.log(pc.dim("Running deployment preflight..."));
  if (!runCommand("npx", ["rw-scripts", "ensure-deploy-env"], { cwd: runtimeDir, env })) {
    console.error(pc.red("Deployment preflight failed"));
    process.exit(1);
  }

  // Step 2: Clean vite cache
  console.log(pc.dim("Cleaning build cache..."));
  if (!runCommand("bun", ["run", "clean"], { cwd: runtimeDir, env })) {
    console.error(pc.red("Clean failed"));
    process.exit(1);
  }

  // Step 3: Build
  console.log(pc.dim("Building for production..."));
  if (!runCommand("bun", ["run", "build"], { cwd: runtimeDir, env })) {
    console.error(pc.red("Build failed"));
    process.exit(1);
  }

  // Step 4: Deploy with --name flag
  // This deploys to Cloudflare with workbook-specific name
  // Does NOT modify wrangler.jsonc (local dev stays on "runtime")
  console.log(pc.dim(`Deploying to Cloudflare as ${workerName}...`));
  if (!runCommand("npx", ["wrangler", "deploy", "--name", workerName], { cwd: runtimeDir, env })) {
    console.error(pc.red("Deployment failed"));
    process.exit(1);
  }

  console.log(pc.green("\nDeployment complete!"));
}
