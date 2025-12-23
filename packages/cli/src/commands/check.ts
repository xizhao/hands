import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import pc from "picocolors";
import { formatValidationErrors, loadSchema, validateMdxPages } from "../mdx-validate.js";
import { findWorkbookRoot } from "../utils.js";

interface CheckOptions {
  fix?: boolean;
}

// Architecture lint rules - check for deprecated imports
const ARCH_RULES = [
  {
    id: "deprecated-import-livepeer",
    pattern: /from\s+["']@livepeer\/hands["']/,
    message: "Use '@hands/core' instead of '@livepeer/hands'",
    severity: "error" as const,
  },
  {
    id: "deprecated-import-hands-db",
    pattern: /from\s+["']@hands\/db["']/,
    message: "Use '@hands/core' instead of '@hands/db'",
    severity: "warning" as const,
  },
  {
    id: "deprecated-import-hands-runtime",
    pattern: /from\s+["']@hands\/runtime["']/,
    message: "Use '@hands/core' instead of '@hands/runtime'",
    severity: "warning" as const,
  },
];

/**
 * Run code quality checks: types and lints.
 * Runs in parallel for speed.
 */
export async function checkCommand(options: CheckOptions = {}) {
  const workbookPath = await findWorkbookRoot();

  if (!workbookPath) {
    console.error(pc.red("Error: Not in a workbook directory"));
    process.exit(1);
  }

  const runtimeDir = path.resolve(import.meta.dirname, "../../../runtime");
  const coreDir = path.resolve(import.meta.dirname, "../../../core");
  const fix = options.fix ?? false;

  console.log(
    pc.blue(`${fix ? "Fixing" : "Checking"} ${pc.bold(path.basename(workbookPath))}...\n`),
  );

  // Run types, lints, MDX validation, and directory structure check in parallel
  const [typesOk, lintsOk, mdxOk, structOk] = await Promise.all([
    runTypes(workbookPath, runtimeDir, coreDir),
    runLints(workbookPath, runtimeDir),
    runMdxValidation(workbookPath),
    runDirectoryStructureCheck(workbookPath),
  ]);

  // Summary
  console.log("");
  if (!typesOk || !lintsOk || !mdxOk || !structOk) {
    console.log(pc.red("✗ Check failed"));
    process.exit(1);
  } else {
    console.log(pc.green("✓ All checks passed"));
    process.exit(0);
  }
}

/**
 * Validate MDX pages: SQL queries, Page references, etc.
 */
async function runMdxValidation(workbookPath: string): Promise<boolean> {
  console.log(pc.cyan("▶ Pages"));

  const pagesDir = path.join(workbookPath, "pages");
  if (!existsSync(pagesDir)) {
    console.log(pc.dim("  (no pages directory)"));
    return true;
  }

  // Load schema for SQL validation
  const schema = loadSchema(workbookPath);
  if (schema.length === 0) {
    console.log(pc.yellow("  ⚠ No schema found (.hands/schema.json) - SQL validation skipped"));
  }

  // Validate all MDX pages
  const errors = validateMdxPages(workbookPath, schema);

  if (errors.length === 0) {
    console.log(pc.green("  ✓ All pages valid"));
    return true;
  }

  // Group by severity
  const errorCount = errors.filter((e) => e.severity === "error").length;
  const warnCount = errors.filter((e) => e.severity === "warning").length;

  formatValidationErrors(errors);

  if (errorCount > 0) {
    console.log(pc.red(`  ${errorCount} error(s), ${warnCount} warning(s)`));
    return false;
  }

  console.log(pc.yellow(`  ${warnCount} warning(s)`));
  return true;
}

/**
 * Generate a tsconfig that extends runtime's tsconfig and checks workbook files.
 */
function generateCheckTsConfig(workbookPath: string, runtimeDir: string, coreDir: string): string {
  return JSON.stringify(
    {
      extends: path.join(runtimeDir, "tsconfig.json"),
      compilerOptions: {
        baseUrl: runtimeDir,
        moduleResolution: "node",
        typeRoots: [path.join(runtimeDir, "node_modules/@types")],
        types: ["node", "react", "react-dom"],
        paths: {
          // Primary import path - @hands/core
          "@hands/core": [path.join(coreDir, "src/index.ts")],
          "@hands/core/*": [path.join(coreDir, "src/*")],
          // Legacy paths for backward compat during migration
          "@hands/db": [path.join(runtimeDir, "types/hands-db.d.ts")],
          "@hands/db/types": [path.join(workbookPath, ".hands/db.d.ts")],
          "@hands/runtime": [path.join(runtimeDir, "types/hands-runtime.d.ts")],
          // React
          react: [path.join(runtimeDir, "node_modules/react")],
          "react/*": [path.join(runtimeDir, "node_modules/react/*")],
          "react-dom": [path.join(runtimeDir, "node_modules/react-dom")],
          "react-dom/*": [path.join(runtimeDir, "node_modules/react-dom/*")],
        },
      },
      include: [
        // New folder structure
        path.join(workbookPath, "pages/**/*.ts"),
        path.join(workbookPath, "pages/**/*.tsx"),
        path.join(workbookPath, "plugins/**/*.ts"),
        path.join(workbookPath, "plugins/**/*.tsx"),
        path.join(workbookPath, "lib/**/*.ts"),
        path.join(workbookPath, "lib/**/*.tsx"),
      ],
      exclude: [path.join(workbookPath, "node_modules"), path.join(workbookPath, ".hands")],
    },
    null,
    2,
  );
}

/**
 * Check if workbook has any TypeScript files to check.
 */
function hasTypescriptFiles(workbookPath: string): boolean {
  const dirs = ["pages", "plugins", "lib"];
  for (const dir of dirs) {
    const dirPath = path.join(workbookPath, dir);
    if (existsSync(dirPath)) {
      try {
        const files = readdirSync(dirPath, { recursive: true });
        if (files.some((f) => String(f).endsWith(".ts") || String(f).endsWith(".tsx"))) {
          return true;
        }
      } catch {
        // Ignore read errors
      }
    }
  }
  return false;
}

/**
 * Run TypeScript type checking.
 */
async function runTypes(
  workbookPath: string,
  runtimeDir: string,
  coreDir: string,
): Promise<boolean> {
  console.log(pc.cyan("▶ Types"));

  // Skip if no TypeScript files
  if (!hasTypescriptFiles(workbookPath)) {
    console.log(pc.dim("  (no TypeScript files)"));
    return true;
  }

  const handsDir = path.join(workbookPath, ".hands");
  if (!existsSync(handsDir)) {
    mkdirSync(handsDir, { recursive: true });
  }

  const tsconfigPath = path.join(handsDir, "tsconfig.check.json");
  writeFileSync(tsconfigPath, generateCheckTsConfig(workbookPath, runtimeDir, coreDir));

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

/**
 * Run all linting: Biome + architecture rules.
 */
async function runLints(workbookPath: string, runtimeDir: string): Promise<boolean> {
  console.log(pc.cyan("▶ Lints"));

  // Run all lint checks
  const [biomeOk, archOk] = await Promise.all([
    runBiome(workbookPath, runtimeDir),
    runArchLints(workbookPath),
  ]);

  return biomeOk && archOk;
}

/**
 * Run Biome linting and formatting.
 */
async function runBiome(workbookPath: string, runtimeDir: string): Promise<boolean> {
  const biomePath = path.join(runtimeDir, "node_modules/.bin/biome");

  if (!existsSync(biomePath)) {
    console.log(pc.yellow("  ⊘ Biome not found in runtime, run bun install"));
    return true;
  }

  // Skip if no TypeScript files to lint
  if (!hasTypescriptFiles(workbookPath)) {
    return true;
  }

  // New folder structure
  const dirs = ["pages", "plugins", "lib"].filter((d) => existsSync(path.join(workbookPath, d)));

  if (dirs.length === 0) {
    return true;
  }

  const configPath = path.join(runtimeDir, "biome.json");
  const args = ["check", "--config-path", configPath, "--colors=force", ...dirs];

  return new Promise((resolve) => {
    const child = spawn(biomePath, args, {
      cwd: workbookPath,
      stdio: "inherit",
    });

    child.on("exit", (code) => resolve(code === 0));
    child.on("error", (err) => {
      console.error(pc.red(`  Failed to run biome: ${err.message}`));
      resolve(false);
    });
  });
}

/**
 * Check architecture rules: deprecated imports.
 */
async function runArchLints(workbookPath: string): Promise<boolean> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Scan all TS/TSX files in pages, plugins, and lib
  const dirsToScan = ["pages", "plugins", "lib"];

  function scanDir(dir: string) {
    if (!existsSync(dir)) return;

    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        scanDir(fullPath);
      } else if (entry.name.endsWith(".tsx") || entry.name.endsWith(".ts")) {
        const content = readFileSync(fullPath, "utf-8");
        const lines = content.split("\n");
        const relPath = path.relative(workbookPath, fullPath);

        for (const rule of ARCH_RULES) {
          for (let i = 0; i < lines.length; i++) {
            if (rule.pattern.test(lines[i])) {
              const msg = `  ${relPath}:${i + 1}: ${rule.message}`;
              if (rule.severity === "error") {
                errors.push(msg);
              } else {
                warnings.push(msg);
              }
            }
            rule.pattern.lastIndex = 0;
          }
        }
      }
    }
  }

  for (const dir of dirsToScan) {
    scanDir(path.join(workbookPath, dir));
  }

  // Print errors first, then warnings
  for (const error of errors) {
    console.log(pc.red(error));
  }
  for (const warning of warnings) {
    console.log(pc.yellow(warning));
  }

  // Errors fail the check, warnings don't
  return errors.length === 0;
}

// Canonical directories for workbook structure
const CANONICAL_DIRS = new Set(["pages", "plugins", "lib", "sources", "actions", ".hands", "public", "node_modules"]);

// Deprecated directories that hint at old architecture
const DEPRECATED_DIRS: Record<string, string> = {
  blocks: "Use 'plugins/' for TSX components or 'pages/blocks/' for MDX fragments",
  ui: "Use 'plugins/' for custom components or import from '@hands/core'",
  components: "Use 'plugins/' for custom components",
};

/**
 * Check directory structure matches canonical layout.
 * Warns about stray directories and deprecated patterns.
 */
async function runDirectoryStructureCheck(workbookPath: string): Promise<boolean> {
  console.log(pc.cyan("▶ Structure"));

  const warnings: string[] = [];
  const errors: string[] = [];

  // Check for non-canonical top-level directories
  for (const entry of readdirSync(workbookPath, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith(".")) continue; // Skip hidden dirs except .hands

    const dirName = entry.name;

    if (DEPRECATED_DIRS[dirName]) {
      errors.push(`  ${pc.red("✗")} Found '${dirName}/' - ${DEPRECATED_DIRS[dirName]}`);
    } else if (!CANONICAL_DIRS.has(dirName)) {
      // Only warn about dirs containing code files
      const dirPath = path.join(workbookPath, dirName);
      const hasCode = hasCodeFiles(dirPath);
      if (hasCode) {
        warnings.push(`  ${pc.yellow("⚠")} Unexpected directory '${dirName}/' - move code to pages/, plugins/, or lib/`);
      }
    }
  }

  // Check for MDX blocks in wrong location (should be pages/blocks/, not blocks/)
  const blocksDir = path.join(workbookPath, "blocks");
  if (existsSync(blocksDir)) {
    const mdxFiles = findMdxFiles(blocksDir);
    if (mdxFiles.length > 0) {
      errors.push(`  ${pc.red("✗")} Found ${mdxFiles.length} MDX file(s) in 'blocks/' - move to 'pages/blocks/'`);
    }
    const tsxFiles = findTsxFiles(blocksDir);
    if (tsxFiles.length > 0) {
      errors.push(`  ${pc.red("✗")} Found ${tsxFiles.length} TSX file(s) in 'blocks/' - move to 'plugins/'`);
    }
  }

  // Print results
  for (const error of errors) {
    console.log(error);
  }
  for (const warning of warnings) {
    console.log(warning);
  }

  if (errors.length === 0 && warnings.length === 0) {
    console.log(pc.green("  ✓ Directory structure OK"));
    return true;
  }

  // Errors fail, warnings don't
  return errors.length === 0;
}

/**
 * Check if directory contains code files (ts/tsx/js/jsx/mdx).
 */
function hasCodeFiles(dir: string): boolean {
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isFile()) {
        if (/\.(ts|tsx|js|jsx|mdx?)$/.test(entry.name)) {
          return true;
        }
      } else if (entry.isDirectory() && !entry.name.startsWith(".")) {
        if (hasCodeFiles(path.join(dir, entry.name))) {
          return true;
        }
      }
    }
  } catch {
    // Ignore errors
  }
  return false;
}

/**
 * Find MDX files in a directory recursively.
 */
function findMdxFiles(dir: string): string[] {
  const files: string[] = [];
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...findMdxFiles(fullPath));
      } else if (/\.mdx?$/.test(entry.name)) {
        files.push(fullPath);
      }
    }
  } catch {
    // Ignore errors
  }
  return files;
}

/**
 * Find TSX/TS files in a directory recursively.
 */
function findTsxFiles(dir: string): string[] {
  const files: string[] = [];
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...findTsxFiles(fullPath));
      } else if (/\.tsx?$/.test(entry.name)) {
        files.push(fullPath);
      }
    }
  } catch {
    // Ignore errors
  }
  return files;
}
