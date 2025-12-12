/**
 * RSC Build System for workbooks
 *
 * Generates a RedwoodSDK-compatible project structure for true RSC with Flight wire format.
 * Uses Vite + @cloudflare/vite-plugin for building and dev server.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { join } from "path"
import { discoverBlocks } from "../blocks/discovery.js"
import type { HandsConfig, BuildResult, BuildOptions } from "./index.js"
import { generateWorkerTemplate } from "./worker-template.js"
import { getStdlibSourcePath } from "../config/index.js"

export interface RSCBuildResult extends BuildResult {
  /** Path to generated vite.config.mts */
  viteConfig?: string
  /** Path to generated worker.tsx */
  workerEntry?: string
}

/**
 * Build a workbook with RSC support using RedwoodSDK/Vite
 */
export async function buildRSC(
  workbookDir: string,
  options: BuildOptions = {}
): Promise<RSCBuildResult> {
  const errors: string[] = []
  const files: string[] = []
  const outputDir = join(workbookDir, ".hands")

  try {
    // Read hands.json
    const handsJsonPath = join(workbookDir, "hands.json")
    if (!existsSync(handsJsonPath)) {
      return {
        success: false,
        outputDir,
        files: [],
        errors: [`No hands.json found in ${workbookDir}`],
      }
    }

    const config: HandsConfig = JSON.parse(readFileSync(handsJsonPath, "utf-8"))

    // Ensure output directory exists
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true })
    }

    // Create src directory
    const srcDir = join(outputDir, "src")
    if (!existsSync(srcDir)) {
      mkdirSync(srcDir, { recursive: true })
    }

    // Discover blocks
    const blocksDir = join(workbookDir, config.blocks?.dir || "./blocks")
    const blocksResult = await discoverBlocks(blocksDir, {
      include: config.blocks?.include,
      exclude: config.blocks?.exclude,
    })

    if (blocksResult.errors.length > 0) {
      for (const err of blocksResult.errors) {
        errors.push(`Block error (${err.file}): ${err.error}`)
      }
    }

    if (options.verbose) {
      console.log(`Found ${blocksResult.blocks.length} blocks`)
      for (const block of blocksResult.blocks) {
        console.log(`  ${block.id} -> ${block.path}`)
      }
    }

    // Get stdlib path first (used by both package.json and vite.config)
    const stdlibPath = getStdlibSourcePath()

    // Generate package.json
    const packageJson = generatePackageJson(config, stdlibPath)
    writeFileSync(join(outputDir, "package.json"), packageJson)
    files.push("package.json")

    // Generate vite.config.mts
    const viteConfig = generateViteConfig()
    writeFileSync(join(outputDir, "vite.config.mts"), viteConfig)
    files.push("vite.config.mts")

    // Generate wrangler.jsonc
    const wranglerConfig = generateWranglerConfig(config)
    writeFileSync(join(outputDir, "wrangler.jsonc"), wranglerConfig)
    files.push("wrangler.jsonc")

    // Generate worker.tsx with RSC block rendering + API routes
    const workerTsx = generateWorkerTemplate({
      config,
      blocks: blocksResult.blocks,
      workbookDir,
    })
    writeFileSync(join(srcDir, "worker.tsx"), workerTsx)
    files.push("src/worker.tsx")

    // Generate client.tsx for hydration
    const clientTsx = generateClientEntry()
    writeFileSync(join(srcDir, "client.tsx"), clientTsx)
    files.push("src/client.tsx")

    // Generate tsconfig.json
    const tsconfig = generateTsConfig()
    writeFileSync(join(outputDir, "tsconfig.json"), tsconfig)
    files.push("tsconfig.json")

    // Generate .gitignore
    writeFileSync(join(outputDir, ".gitignore"), "node_modules/\ndist/\n.wrangler/\n")
    files.push(".gitignore")

    return {
      success: errors.length === 0,
      outputDir,
      files,
      errors,
      blocks: blocksResult.blocks.map((b) => ({ id: b.id, path: b.path, parentDir: b.parentDir })),
      viteConfig: join(outputDir, "vite.config.mts"),
      workerEntry: join(srcDir, "worker.tsx"),
    }
  } catch (error) {
    return {
      success: false,
      outputDir,
      files,
      errors: [error instanceof Error ? error.message : String(error)],
    }
  }
}

/**
 * Generate package.json for the RSC workbook
 */
function generatePackageJson(config: HandsConfig, stdlibPath: string): string {
  const pkg = {
    name: `@hands/${config.name || "workbook"}`,
    version: "1.0.0",
    type: "module",
    private: true,
    scripts: {
      dev: "vite dev",
      build: "vite build",
      preview: "vite preview",
    },
    dependencies: {
      react: "19.2.1",
      "react-dom": "19.2.1",
      "react-server-dom-webpack": "19.2.1",
      rwsdk: "1.0.0-beta.39",
      hono: "^4.7.0",
      "@electric-sql/pglite": "0.2.17",
      "@hands/stdlib": `file:${stdlibPath}`,
    },
    devDependencies: {
      "@cloudflare/vite-plugin": "1.16.1",
      "@cloudflare/workers-types": "4.20251202.0",
      "@types/react": "19.1.2",
      "@types/react-dom": "19.1.2",
      typescript: "5.8.3",
      vite: "7.2.6",
    },
  }

  return JSON.stringify(pkg, null, 2) + "\n"
}

/**
 * Generate vite.config.mts
 * No aliases needed - @hands/stdlib resolves via node_modules symlink
 */
function generateViteConfig(): string {
  return `import { defineConfig } from "vite";
import { redwood } from "rwsdk/vite";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [
    cloudflare({
      viteEnvironment: { name: "worker" },
    }),
    redwood(),
  ],
  optimizeDeps: {
    exclude: ["bun"],
  },
  ssr: {
    external: ["bun"],
    noExternal: ["hono", "@hands/stdlib"],
  },
});
`
}

/**
 * Generate wrangler.jsonc
 */
function generateWranglerConfig(config: HandsConfig): string {
  return `{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "${config.name || "workbook"}",
  "main": "src/worker.tsx",
  "compatibility_date": "2025-08-21",
  "compatibility_flags": ["nodejs_compat"],
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
`
}

// Note: Worker generation moved to worker-template.ts

/**
 * Generate client.tsx for RSC hydration
 */
function generateClientEntry(): string {
  return `// Client entry for RSC hydration
// This handles consuming Flight streams and hydrating client components

import { initClient } from "rwsdk/client";

initClient();

// Export utility for consuming Flight streams from blocks
export async function createBlockFromStream(blockId: string, props: Record<string, unknown> = {}) {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(props)) {
    searchParams.set(key, String(value));
  }

  const response = await fetch(\`/blocks/\${blockId}/rsc?\${searchParams}\`);

  if (!response.ok) {
    throw new Error(\`Failed to fetch block: \${response.statusText}\`);
  }

  // Return the stream for React to consume
  return response.body;
}
`
}

/**
 * Generate tsconfig.json
 */
function generateTsConfig(): string {
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
    "types": ["@cloudflare/workers-types"],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules"]
}
`
}
