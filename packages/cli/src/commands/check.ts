import { spawn } from "child_process";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import path from "path";
import pc from "picocolors";
import { findWorkbookRoot } from "../utils.js";

/**
 * Run diagnostics on workbook: TypeScript type checking and Biome linting.
 * Runs from the runtime directory using the same type environment as Vite.
 */
export async function checkCommand() {
  const workbookPath = await findWorkbookRoot();

  if (!workbookPath) {
    console.error(pc.red("Error: Not in a workbook directory"));
    process.exit(1);
  }

  const runtimeDir = path.resolve(import.meta.dirname, "../../../runtime");

  console.log(pc.blue(`Checking ${pc.bold(path.basename(workbookPath))}...\n`));

  let hasErrors = false;

  // 1. TypeScript type checking
  console.log(pc.cyan("▶ Running TypeScript..."));
  const tscOk = await runTypeCheck(workbookPath, runtimeDir);
  if (!tscOk) hasErrors = true;

  // 2. Biome linting (excludes .hands)
  console.log(pc.cyan("\n▶ Running Biome..."));
  const biomeOk = await runBiome(workbookPath);
  if (!biomeOk) hasErrors = true;

  // Summary
  console.log("");
  if (hasErrors) {
    console.log(pc.red("✗ Check failed"));
    process.exit(1);
  } else {
    console.log(pc.green("✓ All checks passed"));
    process.exit(0);
  }
}

/**
 * Generate a tsconfig that extends runtime's tsconfig and checks workbook files.
 * Uses the same path aliases as Vite's resolve.alias.
 */
function generateCheckTsConfig(workbookPath: string, runtimeDir: string): string {
  return JSON.stringify(
    {
      extends: path.join(runtimeDir, "tsconfig.json"),
      compilerOptions: {
        // Use runtime's baseUrl for module resolution
        baseUrl: runtimeDir,
        // Use simpler module resolution (bundler mode is too strict about exports)
        moduleResolution: "node",
        // Limit type lookups to runtime's node_modules only
        typeRoots: [path.join(runtimeDir, "node_modules/@types")],
        // Override types with absolute paths (extends inherits relative paths that break)
        types: ["node", "react", "react-dom"],
        // Use declaration files for @hands/* to avoid checking runtime source
        paths: {
          "@/*": [path.join(runtimeDir, "src/*")],
          "@hands/db": [path.join(runtimeDir, "types/hands-db.d.ts")],
          "@hands/db/types": [path.join(workbookPath, ".hands/db.d.ts")],
          "@hands/runtime": [path.join(runtimeDir, "types/hands-runtime.d.ts")],
          "@hands/pages": [path.join(runtimeDir, "types/pages-placeholder.d.ts")],
          "@ui/*": [path.join(workbookPath, "ui/*")],
          "@/blocks/*": [path.join(workbookPath, "blocks/*")],
          // Force react resolution to runtime's node_modules
          "react": [path.join(runtimeDir, "node_modules/react")],
          "react/*": [path.join(runtimeDir, "node_modules/react/*")],
          "react-dom": [path.join(runtimeDir, "node_modules/react-dom")],
          "react-dom/*": [path.join(runtimeDir, "node_modules/react-dom/*")],
        },
      },
      // Only check user's workbook files (relative to workbook root, not .hands/)
      include: [
        path.join(workbookPath, "blocks/**/*.ts"),
        path.join(workbookPath, "blocks/**/*.tsx"),
        path.join(workbookPath, "pages/**/*.ts"),
        path.join(workbookPath, "pages/**/*.tsx"),
        path.join(workbookPath, "ui/**/*.ts"),
        path.join(workbookPath, "ui/**/*.tsx"),
        path.join(workbookPath, "lib/**/*.ts"),
        path.join(workbookPath, "lib/**/*.tsx"),
      ],
      // Exclude generated files and node_modules
      exclude: [
        path.join(workbookPath, "node_modules"),
        path.join(workbookPath, ".hands"),
      ],
    },
    null,
    2
  );
}

async function runTypeCheck(workbookPath: string, runtimeDir: string): Promise<boolean> {
  // Ensure .hands directory exists
  const handsDir = path.join(workbookPath, ".hands");
  if (!existsSync(handsDir)) {
    mkdirSync(handsDir, { recursive: true });
  }

  // Generate tsconfig in workbook/.hands (so paths are relative to workbook)
  const tsconfigPath = path.join(handsDir, "tsconfig.check.json");
  writeFileSync(tsconfigPath, generateCheckTsConfig(workbookPath, runtimeDir));

  return new Promise((resolve) => {
    const child = spawn("npx", ["tsc", "--project", tsconfigPath, "--pretty"], {
      cwd: workbookPath,
      stdio: "inherit",
    });

    child.on("exit", (code) => {
      if (code === 0) {
        console.log(pc.green("  ✓ No type errors"));
        resolve(true);
      } else {
        resolve(false);
      }
    });

    child.on("error", (err) => {
      console.error(pc.red(`  Failed to run tsc: ${err.message}`));
      resolve(false);
    });
  });
}

async function runBiome(workbookPath: string): Promise<boolean> {
  // Check if biome is available in the monorepo root
  const monorepoRoot = path.resolve(import.meta.dirname, "../../../../..");
  const biomePath = path.join(monorepoRoot, "node_modules/.bin/biome");

  if (!existsSync(biomePath)) {
    console.log(pc.yellow("  ⊘ Biome not installed, skipping"));
    return true;
  }

  // Get directories that exist
  const dirs = ["blocks", "pages", "lib", "ui"].filter((d) =>
    existsSync(path.join(workbookPath, d))
  );

  if (dirs.length === 0) {
    console.log(pc.yellow("  ⊘ No source directories found, skipping"));
    return true;
  }

  return new Promise((resolve) => {
    // Use biome from monorepo, check workbook dirs, ignore .hands
    const child = spawn(biomePath, ["check", "--colors=force", ...dirs], {
      cwd: workbookPath,
      stdio: "inherit",
    });

    child.on("exit", (code) => {
      if (code === 0) {
        console.log(pc.green("  ✓ No lint errors"));
        resolve(true);
      } else {
        resolve(false);
      }
    });

    child.on("error", (err) => {
      console.error(pc.red(`  Failed to run biome: ${err.message}`));
      resolve(false);
    });
  });
}
