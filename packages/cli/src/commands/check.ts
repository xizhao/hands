import { spawn } from "child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import pc from "picocolors";
import {
  hasUseClientDirective,
  hasUseServerDirective,
  validateBlock,
  validateUIComponent,
} from "../rsc-validate.js";
import { findWorkbookRoot } from "../utils.js";
import {
  validateMdxPages,
  loadSchema,
  formatValidationErrors,
  type ValidationError,
} from "../mdx-validate.js";

interface CheckOptions {
  fix?: boolean;
}

// Architecture lint rules

const ARCH_RULES = [
  {
    id: "block-writes-data",
    pattern: /\b(INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM)\b/gi,
    message: "Blocks should be read-only. Use Actions for writes.",
  },
  {
    id: "deprecated-import",
    pattern: /from\s+["']@hands\/runtime\/context["']/,
    message: "Use `import { sql } from '@hands/db'` instead.",
  },
  {
    id: "deprecated-ctx-sql",
    pattern: /\bctx\.sql\b/,
    message: "ctx.sql is deprecated. Import sql from @hands/db.",
  },
];

/**
 * Fix shadcn config issues (@ui folder and aliases).
 * Returns true if any fixes were applied.
 */
function fixShadcnConfig(workbookPath: string, fix: boolean): boolean {
  let hasIssues = false;

  // Check for @ui folder
  const atUiPath = path.join(workbookPath, "@ui");
  const uiPath = path.join(workbookPath, "ui");

  if (existsSync(atUiPath)) {
    if (fix) {
      if (existsSync(uiPath)) {
        console.log(pc.red("  ✗ Both @ui/ and ui/ folders exist - merge manually"));
        return false;
      }
      const { renameSync } = require("fs");
      renameSync(atUiPath, uiPath);
      console.log(pc.green("  ✓ Fixed: Renamed @ui/ → ui/"));
    } else {
      console.log(pc.red("  ✗ Found @ui/ folder (should be ui/)"));
      hasIssues = true;
    }
  }

  // Check components.json aliases
  const componentsPath = path.join(workbookPath, "components.json");
  if (existsSync(componentsPath)) {
    try {
      const content = readFileSync(componentsPath, "utf-8");
      const config = JSON.parse(content);

      if (config.aliases) {
        const badAliases = Object.entries(config.aliases).filter(
          ([, value]) => typeof value === "string" && (value as string).startsWith("@ui"),
        );

        if (badAliases.length > 0) {
          if (fix) {
            for (const [key, value] of Object.entries(config.aliases)) {
              if (typeof value === "string" && value.startsWith("@ui")) {
                config.aliases[key] = value.replace(/^@ui/, "ui");
              }
            }
            writeFileSync(componentsPath, JSON.stringify(config, null, 2) + "\n");
            console.log(pc.green("  ✓ Fixed: Updated components.json aliases (@ui → ui)"));
          } else {
            console.log(pc.red("  ✗ components.json has @ui aliases (should be ui)"));
            hasIssues = true;
          }
        }
      }
    } catch {
      // Ignore parse errors
    }
  }

  return !hasIssues;
}

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
  const fix = options.fix ?? false;

  console.log(
    pc.blue(`${fix ? "Fixing" : "Checking"} ${pc.bold(path.basename(workbookPath))}...\n`),
  );

  // Check/fix shadcn config
  console.log(pc.cyan("▶ Config"));
  const configOk = fixShadcnConfig(workbookPath, fix);
  if (configOk) {
    console.log(pc.green("  ✓ shadcn config OK"));
  }

  // Fix RSC directives before linting (so linters see correct code)
  if (fix) {
    fixRSCDirectives(workbookPath);
  }

  // Run types, lints, and MDX validation in parallel
  const [typesOk, lintsOk, mdxOk] = await Promise.all([
    runTypes(workbookPath, runtimeDir),
    runLints(workbookPath, runtimeDir, fix),
    runMdxValidation(workbookPath),
  ]);

  // Summary
  console.log("");
  if (!typesOk || !lintsOk || !configOk || !mdxOk) {
    console.log(pc.red("✗ Check failed"));
    process.exit(1);
  } else {
    console.log(pc.green("✓ All checks passed"));
    process.exit(0);
  }
}

/**
 * Validate MDX pages: SQL queries, Block references, etc.
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
 * Fix RSC directives before running checks.
 * Adds "use server" to blocks and "use client" to UI components.
 */
function fixRSCDirectives(workbookPath: string): void {
  const blocksDir = path.join(workbookPath, "blocks");
  const uiDir = path.join(workbookPath, "ui");

  // Fix blocks
  for (const file of findTsxFiles(blocksDir)) {
    const content = readFileSync(file, "utf-8");
    if (!hasUseServerDirective(content)) {
      writeFileSync(file, `"use server";\n\n${content}`);
    }
  }

  // Fix UI
  for (const file of findTsxFiles(uiDir)) {
    const content = readFileSync(file, "utf-8");
    if (!hasUseClientDirective(content)) {
      writeFileSync(file, `"use client";\n\n${content}`);
    }
  }
}

/**
 * Generate a tsconfig that extends runtime's tsconfig and checks workbook files.
 */
function generateCheckTsConfig(workbookPath: string, runtimeDir: string): string {
  return JSON.stringify(
    {
      extends: path.join(runtimeDir, "tsconfig.json"),
      compilerOptions: {
        baseUrl: runtimeDir,
        moduleResolution: "node",
        typeRoots: [path.join(runtimeDir, "node_modules/@types")],
        types: ["node", "react", "react-dom"],
        paths: {
          "@/*": [path.join(runtimeDir, "src/*")],
          "@hands/db": [path.join(runtimeDir, "types/hands-db.d.ts")],
          "@hands/db/types": [path.join(workbookPath, ".hands/db.d.ts")],
          "@hands/runtime": [path.join(runtimeDir, "types/hands-runtime.d.ts")],
          "@hands/pages": [path.join(runtimeDir, "types/pages-placeholder.d.ts")],
          "@ui/*": [path.join(workbookPath, "ui/*")],
          "@/blocks/*": [path.join(workbookPath, "blocks/*")],
          react: [path.join(runtimeDir, "node_modules/react")],
          "react/*": [path.join(runtimeDir, "node_modules/react/*")],
          "react-dom": [path.join(runtimeDir, "node_modules/react-dom")],
          "react-dom/*": [path.join(runtimeDir, "node_modules/react-dom/*")],
        },
      },
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
      exclude: [path.join(workbookPath, "node_modules"), path.join(workbookPath, ".hands")],
    },
    null,
    2,
  );
}

/**
 * Run TypeScript type checking.
 */
async function runTypes(workbookPath: string, runtimeDir: string): Promise<boolean> {
  console.log(pc.cyan("▶ Types"));

  const handsDir = path.join(workbookPath, ".hands");
  if (!existsSync(handsDir)) {
    mkdirSync(handsDir, { recursive: true });
  }

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

/**
 * Run all linting: Biome + RSC directives + architecture rules.
 */
async function runLints(workbookPath: string, runtimeDir: string, fix: boolean): Promise<boolean> {
  console.log(pc.cyan("▶ Lints"));

  // Run all lint checks
  const [biomeOk, rscOk, archOk] = await Promise.all([
    runBiome(workbookPath, runtimeDir, fix),
    runRSCLints(workbookPath),
    runArchLints(workbookPath),
  ]);

  return biomeOk && rscOk && archOk;
}

/**
 * Run Biome linting and formatting.
 */
async function runBiome(workbookPath: string, runtimeDir: string, fix: boolean): Promise<boolean> {
  const biomePath = path.join(runtimeDir, "node_modules/.bin/biome");

  if (!existsSync(biomePath)) {
    console.log(pc.yellow("  ⊘ Biome not found in runtime, run bun install"));
    return true;
  }

  const dirs = ["blocks", "pages", "lib", "ui"].filter((d) =>
    existsSync(path.join(workbookPath, d)),
  );

  if (dirs.length === 0) {
    return true;
  }

  const configPath = path.join(runtimeDir, "biome.json");
  const args = fix
    ? ["check", "--write", "--config-path", configPath, "--colors=force", ...dirs]
    : ["check", "--config-path", configPath, "--colors=force", ...dirs];

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
 * Check RSC directives: "use server" in blocks, "use client" in UI.
 */
async function runRSCLints(workbookPath: string): Promise<boolean> {
  const blocksDir = path.join(workbookPath, "blocks");
  const uiDir = path.join(workbookPath, "ui");
  let hasErrors = false;

  // Check blocks have "use server"
  for (const file of findTsxFiles(blocksDir)) {
    const content = readFileSync(file, "utf-8");
    const relativePath = path.relative(workbookPath, file);
    const result = validateBlock(file, content);

    for (const error of result.errors) {
      console.log(pc.red(`  ${relativePath}: ${error.message}`));
      hasErrors = true;
    }
    for (const warning of result.warnings) {
      console.log(pc.yellow(`  ${relativePath}:${warning.line}: ${warning.message}`));
    }
  }

  // Check UI has "use client"
  for (const file of findTsxFiles(uiDir)) {
    const content = readFileSync(file, "utf-8");
    const relativePath = path.relative(workbookPath, file);
    const result = validateUIComponent(file, content);

    for (const error of result.errors) {
      console.log(pc.red(`  ${relativePath}: ${error.message}`));
      hasErrors = true;
    }
  }

  return !hasErrors;
}

/**
 * Check architecture rules: read-only blocks, deprecated imports.
 */
async function runArchLints(workbookPath: string): Promise<boolean> {
  const blocksDir = path.join(workbookPath, "blocks");
  if (!existsSync(blocksDir)) return true;

  const warnings: string[] = [];

  function scanDir(dir: string) {
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
              warnings.push(`  ${relPath}:${i + 1}: ${rule.message}`);
            }
            rule.pattern.lastIndex = 0;
          }
        }
      }
    }
  }

  scanDir(blocksDir);

  for (const warning of warnings) {
    console.log(pc.yellow(warning));
  }

  // Architecture warnings don't fail the check (advisory only)
  return true;
}

/**
 * Find all .tsx files recursively in a directory.
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
