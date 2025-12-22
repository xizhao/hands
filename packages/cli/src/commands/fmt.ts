import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import pc from "picocolors";
import { findWorkbookRoot } from "../utils.js";

/**
 * Format workbook files with Biome
 */
export async function fmtCommand() {
  const workbookPath = await findWorkbookRoot();

  if (!workbookPath) {
    console.error(pc.red("Error: Not in a workbook directory"));
    process.exit(1);
  }

  console.log(pc.blue(`Formatting ${pc.bold(path.basename(workbookPath))}...\n`));

  await runBiomeFormat(workbookPath);

  console.log(pc.green("\n✓ Format complete"));
}

async function runBiomeFormat(workbookPath: string): Promise<void> {
  // Get biome from runtime package
  const runtimeDir = path.resolve(import.meta.dirname, "../../../runtime");
  const biomePath = path.join(runtimeDir, "node_modules/.bin/biome");
  const configPath = path.join(runtimeDir, "biome.json");

  if (!existsSync(biomePath)) {
    console.log(pc.yellow("  ⊘ Biome not found in runtime, run bun install"));
    return;
  }

  // New folder structure
  const dirs = ["pages", "plugins", "lib"].filter((d) => existsSync(path.join(workbookPath, d)));

  if (dirs.length === 0) {
    console.log(pc.yellow("  ⊘ No source directories found, skipping"));
    return;
  }

  console.log(pc.cyan("▶ Running Biome format..."));

  return new Promise((resolve) => {
    const child = spawn(biomePath, ["check", "--write", "--config-path", configPath, ...dirs], {
      cwd: workbookPath,
      stdio: "inherit",
    });

    child.on("exit", () => {
      resolve();
    });

    child.on("error", (err) => {
      console.error(pc.red(`  Failed to run biome: ${err.message}`));
      resolve();
    });
  });
}
