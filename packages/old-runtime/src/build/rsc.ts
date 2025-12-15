/**
 * RSC Build System for workbooks
 *
 * Generates a RedwoodSDK-compatible project structure for true RSC with Flight wire format.
 * Uses Vite + @cloudflare/vite-plugin for building and dev server.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { discoverBlocks } from "../blocks/discovery.js";
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

    // Generate worker.tsx with RSC block rendering + API routes
    const workerTsx = generateWorkerTemplate({
      config,
      blocks: blocksResult.blocks,
      workbookDir,
    });
    writeFileSync(join(srcDir, "worker.tsx"), workerTsx);
    files.push("src/worker.tsx");

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
export function generateViteConfig(): string {
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

/**
 * Pre-include all stdlib dependencies to avoid mid-session discovery.
 *
 * rwsdk uses Vite's dep optimizer for RSC transforms via esbuild plugins.
 * When deps are discovered mid-request, it causes "new version of pre-bundle" race conditions.
 * By pre-including all known deps, we avoid discovery while keeping rwsdk's transforms working.
 */
function preIncludeStdlibDeps(): Plugin {
  // All dependencies from @hands/stdlib that might be imported
  const stdlibDeps = [
    // Radix UI (used by shadcn components)
    "@radix-ui/react-accordion",
    "@radix-ui/react-alert-dialog",
    "@radix-ui/react-aspect-ratio",
    "@radix-ui/react-avatar",
    "@radix-ui/react-checkbox",
    "@radix-ui/react-collapsible",
    "@radix-ui/react-context-menu",
    "@radix-ui/react-dialog",
    "@radix-ui/react-dropdown-menu",
    "@radix-ui/react-hover-card",
    "@radix-ui/react-label",
    "@radix-ui/react-menubar",
    "@radix-ui/react-navigation-menu",
    "@radix-ui/react-popover",
    "@radix-ui/react-progress",
    "@radix-ui/react-radio-group",
    "@radix-ui/react-scroll-area",
    "@radix-ui/react-select",
    "@radix-ui/react-separator",
    "@radix-ui/react-slider",
    "@radix-ui/react-slot",
    "@radix-ui/react-switch",
    "@radix-ui/react-tabs",
    "@radix-ui/react-toggle",
    "@radix-ui/react-toggle-group",
    "@radix-ui/react-tooltip",
    // Charts
    "recharts",
    // Utils
    "lucide-react",
    "clsx",
    "tailwind-merge",
    "class-variance-authority",
    "date-fns",
    // UI components
    "cmdk",
    "vaul",
    "sonner",
    "input-otp",
    "embla-carousel-react",
    "react-resizable-panels",
    "react-day-picker",
  ];

  return {
    name: "hands-pre-include-deps",
    enforce: "pre",
    config() {
      return {
        optimizeDeps: {
          include: stdlibDeps,
        },
        ssr: {
          optimizeDeps: {
            include: stdlibDeps,
          },
        },
      };
    },
  };
}

export default defineConfig({
  // Vite runs from .hands/ directory to prevent serving blocks/ as static files
  // All paths are relative to .hands/
  plugins: [
    preIncludeStdlibDeps(),
    reactGlobalPlugin(),
    cloudflare({
      viteEnvironment: { name: "worker" },
      // wrangler.jsonc is in .hands/ (same directory as vite.config.mts)
      configPath: "wrangler.jsonc",
    }),
    redwood({
      // wrangler.jsonc is in .hands/ (same directory as vite.config.mts)
      configPath: "wrangler.jsonc",
      // Force stdlib components with "use client" to be treated as client modules
      // These components live in node_modules but contain client directives
      // Path is relative to .hands/, so ../node_modules/
      forceClientPaths: [
        "../node_modules/@hands/stdlib/src/registry/components/**/*.tsx",
      ],
    }),
  ],
  resolve: {
    // @hands/stdlib and @hands/runtime need special handling for subpath exports
    // These packages use "exports" in package.json
    // Note: Must use absolute paths for worker environment (Miniflare) compatibility
    // process.cwd() is .hands/, so we go up one level to workbook root
    alias: [
      // @hands/db/types - auto-generated pgtyped types for SQL queries
      // Points to .hands/types.ts which contains all query result types
      { find: "@hands/db/types", replacement: process.cwd() + "/types.ts" },
      // @hands/db - database access for server components
      // Points to worker.tsx which exports sql, query, params, env
      { find: "@hands/db", replacement: process.cwd() + "/src/worker.tsx" },
      // @hands/stdlib subpath exports: charts/*, ui/*, maps/*, etc.
      { find: /^@hands\\/stdlib\\/(.*)$/, replacement: process.cwd() + "/../node_modules/@hands/stdlib/src/registry/components/$1.tsx" },
      { find: "@hands/stdlib", replacement: process.cwd() + "/../node_modules/@hands/stdlib/src/index.ts" },
    ],
  },
  optimizeDeps: {
    // Disable discovery but keep pre-bundling for deps that are explicitly included.
    // This avoids "new version of pre-bundle" race conditions from mid-session discovery.
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
  define: {
    // Pass runtime port to the worker at build time
    // This is read from process.env.RUNTIME_PORT which is set by the runtime
    "process.env.RUNTIME_PORT": JSON.stringify(process.env.RUNTIME_PORT || "55000"),
  },
});
`;
}

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

  const response = await fetch(\`/blocks/\${blockId}?\${searchParams}\`);

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
