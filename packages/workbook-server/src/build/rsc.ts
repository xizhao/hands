/**
 * RSC Build System for workbooks
 *
 * Generates a RedwoodSDK-compatible project structure for true RSC with Flight wire format.
 * Uses Vite + @cloudflare/vite-plugin for building and dev server.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { discoverBlocks } from "../workbook/discovery.js";
import type { BuildOptions, BuildResult, HandsConfig } from "./index.js";
import { generateWorkerTemplate } from "./worker-template.js";

export interface RSCBuildResult extends BuildResult {
  /** Path to generated vite.config.mts */
  viteConfig?: string;
  /** Path to generated worker.tsx */
  workerEntry?: string;
}

/**
 * Build worker.tsx for a workbook.
 *
 * This ONLY generates worker.tsx with block imports. All other config files
 * (vite.config.mts, package.json, etc.) are created by preflight's scaffoldHandsDir().
 *
 * Called:
 * - At runtime startup (after preflight)
 * - On block file changes (hot reload)
 */
export async function buildRSC(
  workbookDir: string,
  options: BuildOptions = {},
): Promise<RSCBuildResult> {
  const errors: string[] = [];
  const files: string[] = [];
  const outputDir = join(workbookDir, ".hands");
  const srcDir = join(outputDir, "src");

  try {
    // Read config from package.json
    const pkgJsonPath = join(workbookDir, "package.json");
    if (!existsSync(pkgJsonPath)) {
      return {
        success: false,
        outputDir,
        files: [],
        errors: [`No package.json found in ${workbookDir}`],
      };
    }

    const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf-8"));
    const config: HandsConfig = {
      name: pkg.name?.replace(/^@hands\//, "") || "workbook",
      ...pkg.hands,
    };

    // Discover blocks
    const blocksDir = join(workbookDir, config.blocks?.dir || "./blocks");
    const blocksResult = await discoverBlocks(blocksDir, {
      exclude: config.blocks?.exclude,
    });

    if (blocksResult.errors.length > 0) {
      for (const err of blocksResult.errors) {
        errors.push(`Block error (${err.file}): ${err.error}`);
      }
    }

    if (options.verbose) {
      console.log(`Found ${blocksResult.items.length} blocks`);
      for (const block of blocksResult.items) {
        console.log(`  ${block.id} -> ${block.path}`);
      }
    }

    // Generate worker.tsx with RSC block rendering + API routes
    const workerTsx = generateWorkerTemplate({
      config,
      blocks: blocksResult.items,
      workbookDir,
    });
    writeFileSync(join(srcDir, "worker.tsx"), workerTsx);
    files.push("src/worker.tsx");

    return {
      success: errors.length === 0,
      outputDir,
      files,
      errors,
      blocks: blocksResult.items.map((b) => ({ id: b.id, path: b.path, parentDir: b.parentDir })),
      viteConfig: join(outputDir, "vite.config.mts"),
      workerEntry: join(srcDir, "worker.tsx"),
    };
  } catch (error) {
    return {
      success: false,
      outputDir,
      files,
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
}

// Note: generateViteConfig has been removed - vite.config.mts now lives in @hands/runtime package

/**
 * Generate wrangler.jsonc
 */
export function generateWranglerConfig(config: HandsConfig): string {
  // wrangler.jsonc lives in .hands/, so paths are relative to .hands/
  return `{
  "$schema": "../node_modules/wrangler/config-schema.json",
  "name": "${config.name || "workbook"}",
  "main": "src/worker.tsx",
  "compatibility_date": "2025-08-21",
  "compatibility_flags": [
    "nodejs_compat",
    "no_handle_cross_request_promise_resolution"
  ],
  "assets": {
    "binding": "ASSETS"
  },
  "observability": {
    "enabled": true
  },
  "vars": {
    // DATABASE_URL is set at runtime by the dev server
  }
}
`;
}

// Note: Worker generation moved to worker-template.ts

/**
 * Generate client.tsx for RSC hydration
 */
export function generateClientEntry(): string {
  return `// Client entry for RSC hydration
// Minimal client entry - rwsdk handles client component hydration automatically

// Export utility for consuming Flight streams from blocks
export async function createBlockFromStream(blockId: string, props: Record<string, unknown> = {}) {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(props)) {
    searchParams.set(key, String(value));
  }

  const response = await fetch(\`/_editor/blocks/\${blockId}?\${searchParams}\`);

  if (!response.ok) {
    throw new Error(\`Failed to fetch block: \${response.statusText}\`);
  }

  // Return the stream for React to consume
  return response.body;
}
`;
}

/**
 * Generate tsconfig.json
 *
 * Note: We intentionally do NOT define @/* path alias to avoid confusion.
 * Blocks should import from @hands/stdlib or use relative imports.
 */
export function generateTsConfig(): string {
  return `{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "jsx": "react-jsx",
    "jsxImportSource": "react",
    "types": ["@cloudflare/workers-types"]
  },
  "include": ["src/**/*", "../blocks/**/*"],
  "exclude": ["node_modules"]
}
`;
}
