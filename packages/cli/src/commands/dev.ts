import { spawn } from "child_process";
import fs from "fs/promises";
import path from "path";
import pc from "picocolors";
import { preflight } from "../preflight.js";
import { findWorkbookRoot } from "../utils.js";

const MAX_RETRIES = 10;
const RETRY_DELAY_MS = 500;

function isPreBundleError(text: string): boolean {
  return text.includes("new version of the pre-bundle");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

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
  const viteCacheDir = path.join(runtimeDir, "node_modules/.vite");

  async function clearViteCache() {
    try {
      await fs.rm(viteCacheDir, { recursive: true, force: true });
      console.log(pc.yellow("Cleared Vite cache"));
    } catch {
      // Ignore if doesn't exist
    }
  }

  async function runWithRetry(retriesLeft: number): Promise<void> {
    return new Promise((resolve) => {
      let output = "";

      const child = spawn("npx", ["vite", "dev"], {
        cwd: runtimeDir,
        env: {
          ...process.env,
          HANDS_WORKBOOK_PATH: workbookPath ?? undefined,
          NODE_ENV: "development",
        },
        stdio: ["inherit", "pipe", "pipe"] as const,
      });

      child.stdout.on("data", (data: Buffer) => {
        process.stdout.write(data);
        output += data.toString();
      });

      child.stderr.on("data", (data: Buffer) => {
        process.stderr.write(data);
        output += data.toString();
      });

      child.on("exit", async (code: number | null) => {
        if (code !== 0 && isPreBundleError(output) && retriesLeft > 0) {
          console.log(pc.yellow(`\n[hands] Pre-bundle invalidated, retrying... (${retriesLeft} left)`));
          await clearViteCache();
          await sleep(RETRY_DELAY_MS);
          resolve(runWithRetry(retriesLeft - 1));
        } else {
          process.exit(code ?? 0);
        }
      });
    });
  }

  await runWithRetry(MAX_RETRIES);
}
