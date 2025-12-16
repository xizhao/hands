import { spawn } from "child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import pc from "picocolors";
import { findWorkbookRoot } from "../utils.js";
import { hasUseServerDirective, hasUseClientDirective } from "../rsc-validate.js";

/**
 * Find all .tsx files recursively in a directory
 */
function findTsxFiles(dir: string): string[] {
  const files: string[] = [];
  if (!existsSync(dir)) return files;

  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findTsxFiles(fullPath));
    } else if (entry.name.endsWith(".tsx") && !entry.name.endsWith(".test.tsx")) {
      files.push(fullPath);
    }
  }
  return files;
}

/**
 * Format workbook files with Biome and add RSC directives
 */
export async function fmtCommand() {
  const workbookPath = await findWorkbookRoot();

  if (!workbookPath) {
    console.error(pc.red("Error: Not in a workbook directory"));
    process.exit(1);
  }

  console.log(pc.blue(`Formatting ${pc.bold(path.basename(workbookPath))}...\n`));

  // 1. Run Biome format
  console.log(pc.cyan("▶ Running Biome format..."));
  await runBiomeFormat(workbookPath);

  // 2. Add missing RSC directives
  console.log(pc.cyan("\n▶ Adding RSC directives..."));
  await addMissingDirectives(workbookPath);

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

  const dirs = ["blocks", "pages", "lib", "ui"].filter((d) =>
    existsSync(path.join(workbookPath, d))
  );

  if (dirs.length === 0) {
    console.log(pc.yellow("  ⊘ No source directories found, skipping"));
    return;
  }

  return new Promise((resolve) => {
    const child = spawn(
      biomePath,
      ["check", "--write", "--config-path", configPath, ...dirs],
      {
        cwd: workbookPath,
        stdio: "inherit",
      }
    );

    child.on("exit", () => {
      resolve();
    });

    child.on("error", (err) => {
      console.error(pc.red(`  Failed to run biome: ${err.message}`));
      resolve();
    });
  });
}

async function addMissingDirectives(workbookPath: string): Promise<void> {
  const blocksDir = path.join(workbookPath, "blocks");
  const uiDir = path.join(workbookPath, "ui");
  let fixedCount = 0;

  // Add "use server" to blocks missing it
  const blockFiles = findTsxFiles(blocksDir);
  for (const file of blockFiles) {
    const content = readFileSync(file, "utf-8");
    if (!hasUseServerDirective(content)) {
      const fixed = `"use server";\n\n${content}`;
      writeFileSync(file, fixed);
      console.log(pc.green(`  + Added "use server" to ${path.relative(workbookPath, file)}`));
      fixedCount++;
    }
  }

  // Add "use client" to UI components missing it
  const uiFiles = findTsxFiles(uiDir);
  for (const file of uiFiles) {
    const content = readFileSync(file, "utf-8");
    if (!hasUseClientDirective(content)) {
      const fixed = `"use client";\n\n${content}`;
      writeFileSync(file, fixed);
      console.log(pc.green(`  + Added "use client" to ${path.relative(workbookPath, file)}`));
      fixedCount++;
    }
  }

  if (fixedCount === 0) {
    console.log(pc.dim("  All files already have directives"));
  }
}
