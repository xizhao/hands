/**
 * RSC Build System for workbooks
 *
 * Generates a RedwoodSDK-compatible project structure for true RSC with Flight wire format.
 * Uses Vite + @cloudflare/vite-plugin for building and dev server.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { discoverBlocks } from "../blocks/discovery.js";
import { getStdlibSourcePath } from "../config/index.js";
import type { BuildOptions, BuildResult, HandsConfig } from "./index.js";
import { generateWorkerTemplate } from "./worker-template.js";

export interface RSCBuildResult extends BuildResult {
  /** Path to generated vite.config.mts */
  viteConfig?: string;
  /** Path to generated worker.tsx */
  workerEntry?: string;
}

/**
 * Build a workbook with RSC support using RedwoodSDK/Vite
 */
export async function buildRSC(
  workbookDir: string,
  options: BuildOptions = {},
): Promise<RSCBuildResult> {
  const errors: string[] = [];
  const files: string[] = [];
  const outputDir = join(workbookDir, ".hands");

  try {
    // Read hands.json
    const handsJsonPath = join(workbookDir, "hands.json");
    if (!existsSync(handsJsonPath)) {
      return {
        success: false,
        outputDir,
        files: [],
        errors: [`No hands.json found in ${workbookDir}`],
      };
    }

    const config: HandsConfig = JSON.parse(readFileSync(handsJsonPath, "utf-8"));

    // Ensure output directory exists
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    // Create src directory
    const srcDir = join(outputDir, "src");
    if (!existsSync(srcDir)) {
      mkdirSync(srcDir, { recursive: true });
    }

    // Discover blocks
    const blocksDir = join(workbookDir, config.blocks?.dir || "./blocks");
    const blocksResult = await discoverBlocks(blocksDir, {
      include: config.blocks?.include,
      exclude: config.blocks?.exclude,
    });

    if (blocksResult.errors.length > 0) {
      for (const err of blocksResult.errors) {
        errors.push(`Block error (${err.file}): ${err.error}`);
      }
    }

    if (options.verbose) {
      console.log(`Found ${blocksResult.blocks.length} blocks`);
      for (const block of blocksResult.blocks) {
        console.log(`  ${block.id} -> ${block.path}`);
      }
    }

    // Get stdlib path first (used by both package.json and vite.config)
    const stdlibPath = getStdlibSourcePath();

    // Generate package.json
    const packageJson = generatePackageJson(config, stdlibPath);
    writeFileSync(join(outputDir, "package.json"), packageJson);
    files.push("package.json");

    // Generate vite.config.mts
    const viteConfig = generateViteConfig();
    writeFileSync(join(outputDir, "vite.config.mts"), viteConfig);
    files.push("vite.config.mts");

    // Generate wrangler.jsonc
    const wranglerConfig = generateWranglerConfig(config);
    writeFileSync(join(outputDir, "wrangler.jsonc"), wranglerConfig);
    files.push("wrangler.jsonc");

    // Generate worker.tsx with RSC block rendering + API routes
    const workerTsx = generateWorkerTemplate({
      config,
      blocks: blocksResult.blocks,
      workbookDir,
    });
    writeFileSync(join(srcDir, "worker.tsx"), workerTsx);
    files.push("src/worker.tsx");

    // Generate client.tsx for hydration
    const clientTsx = generateClientEntry();
    writeFileSync(join(srcDir, "client.tsx"), clientTsx);
    files.push("src/client.tsx");

    // Generate tsconfig.json
    const tsconfig = generateTsConfig();
    writeFileSync(join(outputDir, "tsconfig.json"), tsconfig);
    files.push("tsconfig.json");

    // Generate .gitignore
    writeFileSync(join(outputDir, ".gitignore"), "node_modules/\ndist/\n.wrangler/\n");
    files.push(".gitignore");

    return {
      success: errors.length === 0,
      outputDir,
      files,
      errors,
      blocks: blocksResult.blocks.map((b) => ({ id: b.id, path: b.path, parentDir: b.parentDir })),
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
      "@trpc/client": "^11.0.0",
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
  };

  return `${JSON.stringify(pkg, null, 2)}\n`;
}

/**
 * Generate vite.config.mts
 *
 * For cross-origin RSC: Client components are loaded by the editor from a different origin.
 * React must be a singleton - multiple copies cause "Invalid hook call" errors.
 *
 * Solution: Use rollup's `output.globals` to mark React as external and expect it on `window`.
 * The editor exposes React on `window.__HANDS_REACT__` and we map to that.
 *
 * server.fs.allow: ["/"] enables /@fs/ access to any file (for loading stdlib "use client" components)
 */
function generateViteConfig(): string {
  return `import { defineConfig, Plugin } from "vite";
import { redwood } from "rwsdk/vite";
import { cloudflare } from "@cloudflare/vite-plugin";

// React modules to exclude from pre-bundling and mark as external for client environment
// The editor provides these via import map, so runtime should not bundle them
const REACT_EXTERNALS = [
  "react",
  "react-dom",
  "react-dom/client",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
];

/**
 * Plugin to provide React from window.__HANDS_REACT__ for client environment.
 *
 * Uses virtual modules that read from the editor's React singleton.
 * The editor sets window.__HANDS_REACT__ before loading any RSC client components.
 *
 * This approach avoids Vite's pre-bundled deps entirely for React.
 */
function reactGlobalPlugin(): Plugin {
  const reactModules = new Set(REACT_EXTERNALS);

  return {
    name: "hands-react-global",
    enforce: "pre",



    resolveId(id, _importer, options) {
      // @ts-ignore
      const env = this.environment?.name || options?.environment?.name;
      if (env === "worker" || env === "ssr") return null;

      if (reactModules.has(id)) {
        return "\\0hands-react:" + id;
      }
    },

    load(id, options) {
      if (!id.startsWith("\\0hands-react:")) return null;

      // @ts-ignore
      const env = this.environment?.name || options?.environment?.name;
      if (env === "worker" || env === "ssr") return null;

      const moduleId = id.slice("\\0hands-react:".length);

      if (moduleId === "react") {
        return \`
const R = window.__HANDS_REACT__?.React;
if (!R) throw new Error("[hands] window.__HANDS_REACT__.React not found");
export default R;
export const Children = R.Children;
export const Component = R.Component;
export const Fragment = R.Fragment;
export const Profiler = R.Profiler;
export const PureComponent = R.PureComponent;
export const StrictMode = R.StrictMode;
export const Suspense = R.Suspense;
export const cloneElement = R.cloneElement;
export const createContext = R.createContext;
export const createElement = R.createElement;
export const createRef = R.createRef;
export const forwardRef = R.forwardRef;
export const isValidElement = R.isValidElement;
export const lazy = R.lazy;
export const memo = R.memo;
export const startTransition = R.startTransition;
export const useCallback = R.useCallback;
export const useContext = R.useContext;
export const useDebugValue = R.useDebugValue;
export const useDeferredValue = R.useDeferredValue;
export const useEffect = R.useEffect;
export const useId = R.useId;
export const useImperativeHandle = R.useImperativeHandle;
export const useInsertionEffect = R.useInsertionEffect;
export const useLayoutEffect = R.useLayoutEffect;
export const useMemo = R.useMemo;
export const useReducer = R.useReducer;
export const useRef = R.useRef;
export const useState = R.useState;
export const useSyncExternalStore = R.useSyncExternalStore;
export const useTransition = R.useTransition;
export const version = R.version;
export const use = R.use;
export const useOptimistic = R.useOptimistic;
export const useActionState = R.useActionState;
export const cache = R.cache;
\`;
      }

      if (moduleId === "react-dom" || moduleId === "react-dom/client") {
        return \`
const RD = window.__HANDS_REACT__?.ReactDOM;
if (!RD) throw new Error("[hands] window.__HANDS_REACT__.ReactDOM not found");
export default RD;
export const createPortal = RD.createPortal;
export const flushSync = RD.flushSync;
export const createRoot = RD.createRoot;
export const hydrateRoot = RD.hydrateRoot;
export const version = RD.version;
\`;
      }

      if (moduleId === "react/jsx-runtime") {
        return \`
const JSX = window.__HANDS_REACT__?.ReactJSXRuntime;
if (!JSX) throw new Error("[hands] window.__HANDS_REACT__.ReactJSXRuntime not found");
export const jsx = JSX.jsx;
export const jsxs = JSX.jsxs;
export const Fragment = JSX.Fragment;
\`;
      }

      if (moduleId === "react/jsx-dev-runtime") {
        return \`
const JSX = window.__HANDS_REACT__?.ReactJSXDevRuntime;
if (!JSX) throw new Error("[hands] window.__HANDS_REACT__.ReactJSXDevRuntime not found");
export const jsx = JSX.jsx;
export const jsxs = JSX.jsxs;
export const jsxDEV = JSX.jsxDEV;
export const Fragment = JSX.Fragment;
\`;
      }
    },
  };
}

export default defineConfig({
  plugins: [
    reactGlobalPlugin(),
    cloudflare({
      viteEnvironment: { name: "worker" },
    }),
    redwood(),
  ],
  optimizeDeps: {
    // Disable discovery but keep pre-bundling for deps that are explicitly included.
    // This avoids "new version of pre-bundle" race conditions from mid-session discovery.
    // React deps are pre-bundled so the vite-proxy can intercept them for cross-origin loading.
    noDiscovery: true,
    include: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
  },
  build: {
    rollupOptions: {
      // Mark React as external in production builds
      external: REACT_EXTERNALS,
    },
  },
  ssr: {
    external: ["bun"],
    noExternal: ["hono", "@hands/stdlib"],
    optimizeDeps: {
      // Disable SSR dep optimization to avoid "new version of pre-bundle" race conditions
      noDiscovery: true,
      include: [],
    },
  },
  server: {
    fs: {
      // Allow serving files from anywhere (for /@fs/ access to stdlib components)
      allow: ["/"],
    },
  },
});
`;
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
`;
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
`;
}

/**
 * Generate tsconfig.json
 *
 * Note: We intentionally do NOT define @/* path alias to avoid confusion.
 * Blocks should import from @hands/stdlib or use relative imports.
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
    "jsxImportSource": "react",
    "types": ["@cloudflare/workers-types"]
  },
  "include": ["src/**/*", "../blocks/**/*"],
  "exclude": ["node_modules"]
}
`;
}
