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
 * Get the actual path to @hands/editor source
 * Works in both development (monorepo) and production
 */
export function getEditorSourcePath(): string {
  // In development, editor is a sibling package in packages/editor
  const devPath = resolve(import.meta.dir, "../../../editor");
  if (existsSync(join(devPath, "package.json"))) {
    try {
      return realpathSync(devPath);
    } catch {
      return devPath;
    }
  }
  // Fallback: check relative to workbook-server package root
  const workbookServerRoot = resolve(import.meta.dir, "../..");
  const altDevPath = resolve(workbookServerRoot, "../editor");
  if (existsSync(join(altDevPath, "package.json"))) {
    try {
      return realpathSync(altDevPath);
    } catch {
      return altDevPath;
    }
  }
  // Last resort: node_modules
  const nodeModulesPath = resolve(import.meta.dir, "../../node_modules/@hands/editor");
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

// Source configuration
export const SourceConfigSchema = z.object({
  /** Whether this source is enabled */
  enabled: z.boolean().default(true),
  /** Cron schedule for automatic sync (e.g., "0 *\/6 * * *" for every 6 hours) */
  schedule: z.string().optional(),
  /** Whether to sync automatically on schedule */
  autoSync: z.boolean().default(true),
  /** Whether to sync when runtime starts */
  syncOnStart: z.boolean().default(false),
  /** Source-specific options */
  options: z.record(z.unknown()).optional(),
});

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
  sources: z.record(z.string(), SourceConfigSchema).default({}),
  secrets: z.record(z.string(), SecretSchema).default({}),
  database: DatabaseConfigSchema.default({}),
  build: BuildConfigSchema.default({}),
  dev: DevConfigSchema.default({}),
});

// Export types
export type HandsConfig = z.infer<typeof HandsConfigSchema>;
export type SourceConfig = z.infer<typeof SourceConfigSchema>;
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
    sources: {},
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
 * Initialize a new workbook with standard structure and starter files.
 * This is the single source of truth for workbook creation - used by CLI and desktop app.
 */
export async function initWorkbook(options: InitWorkbookOptions): Promise<void> {
  const { name, directory } = options;
  const { mkdirSync, writeFileSync } = await import("node:fs");
  const { join } = await import("node:path");

  const slug = slugify(name);

  // Create directory structure (no pages/ or blocks/ - user creates on demand)
  mkdirSync(join(directory, "migrations"), { recursive: true });
  mkdirSync(join(directory, "lib"), { recursive: true });
  mkdirSync(join(directory, "sources"), { recursive: true });

  // Create package.json with hands config embedded
  const stdlibPath = getStdlibPath();
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
      sources: {},
      secrets: {},
      database: { migrations: "./migrations" },
      build: { outDir: ".hands" },
      dev: { hmr: true },
    },
    dependencies: {
      "@hands/stdlib": `file:${stdlibPath}`,
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

  // Create tsconfig.json
  const tsconfig = {
    compilerOptions: {
      target: "ESNext",
      module: "ESNext",
      moduleResolution: "bundler",
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      jsx: "react-jsx",
      jsxImportSource: "react",
      baseUrl: ".",
      paths: {
        "@hands/db": [".hands/src/worker.tsx"],
        "@hands/db/types": [".hands/types.ts"],
      },
    },
    include: ["blocks/**/*", "pages/**/*", "lib/**/*", ".hands/src/**/*", ".hands/types.ts"],
  };
  writeFileSync(join(directory, "tsconfig.json"), `${JSON.stringify(tsconfig, null, 2)}\n`);

  // Create .gitignore
  const gitignore = `node_modules/
.hands/
db/
*.log
`;
  writeFileSync(join(directory, ".gitignore"), gitignore);

  // Create lib/db.ts helper
  const dbHelper = `// Database helper - re-exported from context for convenience
export type { BlockContext, DbContext, BlockFn, BlockProps } from "@hands/stdlib"
`;
  writeFileSync(join(directory, "lib/db.ts"), dbHelper);
}
