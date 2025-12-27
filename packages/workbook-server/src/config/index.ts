/**
 * Configuration types and validation for workbook config
 *
 * Config is stored in package.json under the "hands" field.
 * This is the single source of truth for workbook configuration.
 * CLI and other packages should import from here.
 */

import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { z } from "zod";

/**
 * Get the ~/.hands directory path
 */
export function getHandsDir(): string {
  return join(homedir(), ".hands");
}

/**
 * Get the path to the stdlib symlink in ~/.hands/stdlib
 */
export function getStdlibSymlinkPath(): string {
  return join(getHandsDir(), "stdlib");
}

/**
 * Get the actual path to @hands/stdlib source
 * Works in both development (monorepo) and production
 * Resolves symlinks to get the real path
 */
export function getStdlibSourcePath(): string {
  // In development, stdlib is a sibling package in packages/stdlib
  // From src/config/index.ts -> ../../../stdlib = packages/stdlib
  const devPath = resolve(import.meta.dir, "../../../stdlib");
  if (existsSync(join(devPath, "package.json"))) {
    // Resolve any symlinks to get the real absolute path
    try {
      return realpathSync(devPath);
    } catch {
      return devPath;
    }
  }
  // Fallback: check relative to runtime package root
  const runtimeRoot = resolve(import.meta.dir, "../..");
  const altDevPath = resolve(runtimeRoot, "../stdlib");
  if (existsSync(join(altDevPath, "package.json"))) {
    try {
      return realpathSync(altDevPath);
    } catch {
      return altDevPath;
    }
  }
  // Last resort: node_modules (but use import.meta.dir, not cwd)
  const nodeModulesPath = resolve(import.meta.dir, "../../node_modules/@hands/stdlib");
  try {
    return realpathSync(nodeModulesPath);
  } catch {
    return nodeModulesPath;
  }
}

/**
 * Get the actual path to @hands/runtime source
 * This is the Vite runtime package with vite.config.mts
 * Works in both development (monorepo) and production
 */
export function getRuntimeSourcePath(): string {
  // First check for explicit env var (set by Tauri for compiled sidecars)
  const envPath = process.env.HANDS_RUNTIME_PATH;
  if (envPath && existsSync(join(envPath, "vite.config.mts"))) {
    try {
      return realpathSync(envPath);
    } catch {
      return envPath;
    }
  }

  // In development, runtime is a sibling package in packages/runtime
  const devPath = resolve(import.meta.dir, "../../../runtime");
  if (existsSync(join(devPath, "vite.config.mts"))) {
    try {
      return realpathSync(devPath);
    } catch {
      return devPath;
    }
  }
  // Fallback: check relative to workbook-server package root
  const workbookServerRoot = resolve(import.meta.dir, "../..");
  const altDevPath = resolve(workbookServerRoot, "../runtime");
  if (existsSync(join(altDevPath, "vite.config.mts"))) {
    try {
      return realpathSync(altDevPath);
    } catch {
      return altDevPath;
    }
  }
  // Last resort: node_modules
  const nodeModulesPath = resolve(import.meta.dir, "../../node_modules/@hands/runtime");
  try {
    return realpathSync(nodeModulesPath);
  } catch {
    return nodeModulesPath;
  }
}

/**
 * Ensure the stdlib symlink exists at ~/.hands/stdlib
 * Creates or updates it to point to the correct source
 */
export function ensureStdlibSymlink(): string {
  const handsDir = getHandsDir();
  const symlinkPath = getStdlibSymlinkPath();
  const sourcePath = getStdlibSourcePath();

  // Ensure ~/.hands directory exists
  if (!existsSync(handsDir)) {
    mkdirSync(handsDir, { recursive: true });
  }

  // Check if symlink already exists (use lstat to detect broken symlinks too)
  try {
    const stat = lstatSync(symlinkPath);
    if (stat.isSymbolicLink()) {
      const currentTarget = readlinkSync(symlinkPath);
      if (currentTarget === sourcePath) {
        // Symlink already correct
        return symlinkPath;
      }
      // Symlink points to wrong location, remove it
      unlinkSync(symlinkPath);
    } else {
      // It's a file or directory, remove it
      unlinkSync(symlinkPath);
    }
  } catch (e) {
    // ENOENT means nothing exists at path - that's fine, we'll create it
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
      // Some other error, try to remove and recreate
      try {
        unlinkSync(symlinkPath);
      } catch {
        // Ignore errors
      }
    }
  }

  // Create symlink
  try {
    symlinkSync(sourcePath, symlinkPath);
    console.log(`[config] Created stdlib symlink: ${symlinkPath} -> ${sourcePath}`);
  } catch (err) {
    console.error(`[config] Failed to create stdlib symlink:`, err);
  }

  return symlinkPath;
}

/**
 * Get the path to use for @hands/stdlib in workbook package.json
 * Uses the ~/.hands/stdlib symlink for portability
 */
function getStdlibPath(): string {
  // Ensure symlink exists and is correct
  ensureStdlibSymlink();
  return getStdlibSymlinkPath();
}

// Secret requirement
export const SecretSchema = z.object({
  required: z.boolean().default(true),
  description: z.string().optional(),
});

// Pages configuration
export const PagesConfigSchema = z.object({
  dir: z.string().default("./pages"),
});

// Blocks configuration
export const BlocksConfigSchema = z.object({
  dir: z.string().default("./blocks"),
  include: z.array(z.string()).optional(),
  exclude: z.array(z.string()).optional(),
});

// Database configuration
export const DatabaseConfigSchema = z.object({
  migrations: z.string().default("./migrations"),
});

// Build configuration
export const BuildConfigSchema = z.object({
  outDir: z.string().default(".hands"),
  external: z.array(z.string()).optional(),
});

// Dev configuration
export const DevConfigSchema = z.object({
  port: z.number().optional(),
  hmr: z.boolean().default(true),
});

// Hands config schema (stored in package.json under "hands" field)
export const HandsConfigSchema = z.object({
  name: z.string().optional(), // Falls back to package.json name
  version: z.string().default("0.1.0"),
  pages: PagesConfigSchema.default({}),
  blocks: BlocksConfigSchema.default({}),
  secrets: z.record(z.string(), SecretSchema).default({}),
  database: DatabaseConfigSchema.default({}),
  build: BuildConfigSchema.default({}),
  dev: DevConfigSchema.default({}),
});

// Export types
export type HandsConfig = z.infer<typeof HandsConfigSchema>;
export type SecretConfig = z.infer<typeof SecretSchema>;
export type PagesConfig = z.infer<typeof PagesConfigSchema>;
export type BlocksConfig = z.infer<typeof BlocksConfigSchema>;
export type DatabaseConfig = z.infer<typeof DatabaseConfigSchema>;
export type BuildConfig = z.infer<typeof BuildConfigSchema>;
export type DevConfig = z.infer<typeof DevConfigSchema>;

/**
 * Load and validate config from package.json "hands" field
 */
export function loadConfig(workbookDir: string): HandsConfig & { name: string } {
  const pkgPath = join(workbookDir, "package.json");

  if (!existsSync(pkgPath)) {
    throw new Error(`package.json not found at ${pkgPath}`);
  }

  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    const handsConfig = pkg.hands || {};
    const parsed = HandsConfigSchema.parse(handsConfig);

    // Use hands.name or fall back to package name
    const name = parsed.name || pkg.name?.replace(/^@hands\//, "") || "workbook";

    return { ...parsed, name };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
      throw new Error(`Invalid hands config in package.json:\n${issues}`);
    }
    throw error;
  }
}

/**
 * Save config to package.json "hands" field
 */
export function saveConfig(workbookDir: string, config: Partial<HandsConfig>): void {
  const pkgPath = join(workbookDir, "package.json");

  const pkg = existsSync(pkgPath)
    ? JSON.parse(readFileSync(pkgPath, "utf-8"))
    : {};

  pkg.hands = { ...pkg.hands, ...config };
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
}

/**
 * Create default hands config for a new workbook
 */
export function createDefaultConfig(name: string): HandsConfig {
  return {
    name,
    version: "0.1.0",
    pages: { dir: "./pages" },
    blocks: { dir: "./blocks" },
    secrets: {},
    database: { migrations: "./migrations" },
    build: { outDir: ".hands" },
    dev: { hmr: true },
  };
}

/**
 * Slugify a string for use as a workbook name
 */
export function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// ============================================
// Workbook Initialization
// ============================================

export interface InitWorkbookOptions {
  /** Display name of the workbook */
  name: string;
  /** Optional description */
  description?: string;
  /** Target directory (must exist or will be created) */
  directory: string;
}

/**
 * Generate tsconfig.json content with paths to the runtime package.
 * Uses relative paths from workbook to runtime for portability.
 */
export function generateWorkbookTsConfig(workbookDir: string): string {
  const runtimePath = getRuntimeSourcePath();
  const { relative, join } = require("node:path");

  // Compute relative path from workbook to runtime
  const relativeRuntimePath = relative(workbookDir, runtimePath);
  // Core is sibling to runtime
  const relativeCorePath = relative(workbookDir, join(runtimePath, "../core"));

  const tsconfig = {
    compilerOptions: {
      target: "ES2022",
      lib: ["ES2022", "DOM", "DOM.Iterable"],
      module: "ESNext",
      moduleResolution: "bundler",
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      jsx: "react-jsx",
      jsxImportSource: "react",
      baseUrl: ".",
      paths: {
        // Core primitives (for actions)
        "@hands/core/primitives": [`${relativeCorePath}/src/primitives/index.ts`],
        "@hands/core": [`${relativeCorePath}/src/index.ts`],
        // Database access
        "@hands/db": [`${relativeRuntimePath}/src/db/dev.ts`],
        "@hands/db/types": [".hands/db.d.ts"],
        // Cloud services (for actions)
        "@hands/services": [`${relativeRuntimePath}/src/services/index.ts`],
        // Runtime types (BlockFn, BlockMeta, etc.)
        "@hands/runtime": [`${relativeRuntimePath}/src/types/index.ts`],
        // UI components
        "@ui/*": ["ui/*"],
        "@ui/lib/utils": [`${relativeRuntimePath}/src/lib/utils.ts`],
      },
    },
    include: ["plugins/**/*", "pages/**/*", "sources/**/*", "actions/**/*", "ui/**/*", "lib/**/*"],
    exclude: ["node_modules", ".hands"],
  };

  return JSON.stringify(tsconfig, null, 2);
}

// Welcome page template
const WELCOME_PAGE_TEMPLATE = `---
title: "Welcome"
---

# Welcome to Hands

This is your new workbook. Here's how to get started:

## Getting Started

1. **Import Data** - Drag and drop CSV, JSON, or Parquet files into the chat
2. **Ask Questions** - Use natural language to query and analyze your data
3. **Create Pages** - Click the + button in the sidebar to add more pages

## Quick Tips

- Use \`@\` to reference tables in your queries
- Pages auto-save as you edit
- Each workbook has its own embedded database

Happy analyzing!
`;

/**
 * Initialize a new workbook with standard structure and starter files.
 * This is the single source of truth for workbook creation - used by CLI and desktop app.
 */
export async function initWorkbook(options: InitWorkbookOptions): Promise<void> {
  const { name, directory } = options;
  const { mkdirSync, writeFileSync } = await import("node:fs");
  const { join } = await import("node:path");

  const slug = slugify(name);

  // Create directory structure
  mkdirSync(join(directory, "migrations"), { recursive: true });
  mkdirSync(join(directory, "lib"), { recursive: true });
  mkdirSync(join(directory, "ui"), { recursive: true });
  mkdirSync(join(directory, "pages"), { recursive: true });

  // Create package.json with hands config embedded
  const packageJson = {
    name: `@hands/${slug}`,
    version: "0.0.1",
    private: true,
    type: "module",
    scripts: {
      dev: "hands dev",
      build: "hands build",
    },
    hands: {
      version: "0.1.0",
      pages: { dir: "./pages" },
      blocks: { dir: "./blocks" },
      secrets: {},
      database: { migrations: "./migrations" },
      build: { outDir: ".hands" },
      dev: { hmr: true },
    },
    dependencies: {
      react: "^19.0.0",
      "react-dom": "^19.0.0",
    },
    devDependencies: {
      "@types/react": "^19.0.0",
      "@types/react-dom": "^19.0.0",
      typescript: "^5",
    },
  };
  writeFileSync(join(directory, "package.json"), `${JSON.stringify(packageJson, null, 2)}\n`);

  // Create tsconfig.json with paths to runtime
  writeFileSync(join(directory, "tsconfig.json"), `${generateWorkbookTsConfig(directory)}\n`);

  // Create .gitignore
  const gitignore = `node_modules/
.hands/
db/
*.log
`;
  writeFileSync(join(directory, ".gitignore"), gitignore);

  // Create welcome page
  writeFileSync(join(directory, "pages", "welcome.mdx"), WELCOME_PAGE_TEMPLATE);
}
