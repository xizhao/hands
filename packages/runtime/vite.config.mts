import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { redwood } from "rwsdk/vite";
import { defineConfig } from "vite";
import { editorPlugin } from "./src/vite-plugin-editor";
import { dbTypesPlugin } from "./src/vite-plugin-db-types";
import { workbookPlugin } from "./src/vite-plugin-workbook";
import { staleDepRetryPlugin } from "./src/vite-plugin-stale-dep-retry";
import { tailwindSourcePlugin } from "./src/vite-plugin-tailwind-source";
import { tunnelPlugin } from "./src/vite-plugin-tunnel";

const isDev = process.env.NODE_ENV !== "production";
const workbookPath = process.env.HANDS_WORKBOOK_PATH ?? "";

if (!workbookPath) {
  throw new Error("HANDS_WORKBOOK_PATH environment variable is required");
}

// Build output directory - defaults to .hands/dist in workbook
const outDir = process.env.HANDS_BUILD_OUTPUT ?? path.join(workbookPath, ".hands/dist");

export default defineConfig({
  // Build output configuration
  build: {
    outDir,
    emptyOutDir: true,
    // Ensure dependencies are resolved from monorepo root
    commonjsOptions: {
      include: [/node_modules/],
    },
    rollupOptions: {
      // Don't treat these as external - they need to be bundled
      external: ["cloudflare:workers"],
    },
  },
  server: {
    host: true, // Expose to LAN
    allowedHosts: [".trycloudflare.com"], // Allow tunnel requests
    watch: {
      // Ignore build output to prevent HMR errors during deploy
      ignored: ["**/dist/**"],
    },
  },
  define: {
    "process.env.HANDS_WORKBOOK_PATH": JSON.stringify(workbookPath),
  },
  environments: {
    ssr: {
      optimizeDeps: {
        // Disable SSR dep optimization to avoid prebundle race conditions
        noDiscovery: true,
      },
    },
    worker: {
      optimizeDeps: {
        // Pre-bundle CJS packages that use `exports` (not compatible with ESM worker)
        include: [
          "is-hotkey",
          "slate",
          "slate-dom",
          "slate-react",
          "slate-hyperscript",
          "platejs",
          "platejs/static",
          // Common workbook deps (avoid mid-request discovery)
          "tailwind-merge",
          "clsx",
          "class-variance-authority",
          // rwsdk internals (must be pre-bundled to avoid stale cache errors)
          "rwsdk/use-synced-state/worker",
        ],
        esbuildOptions: {
          // Worker uses "neutral" platform which ignores "main" by default
          mainFields: ["module", "main"],
        },
      },
      resolve: {
        // Ensure consistent resolution in worker
        mainFields: ["module", "main", "browser"],
        dedupe: ["is-hotkey", "slate", "slate-dom", "slate-react"],
      },
    },
  },
  ssr: {
    // Cloudflare-specific imports must be external (only available in worker runtime)
    external: ["cloudflare:workers"],
    // Force bundling of CJS packages that use `exports` (not compatible with ESM worker)
    noExternal: [
      "is-hotkey",
      "slate",
      "slate-dom",
      "slate-react",
      "slate-hyperscript",
      /^@platejs\//,
      "platejs",
      /^platejs\//,
      /^lodash/,  // lodash is CJS, used by @platejs/slate
    ],
    optimizeDeps: {
      include: [
        "is-hotkey",
        "slate",
        "slate-dom",
        "slate-react",
        // Common workbook deps (avoid mid-request discovery)
        "tailwind-merge",
        "clsx",
        "class-variance-authority",
      ],
      esbuildOptions: {
        mainFields: ["module", "main"],
      },
    },
  },
  plugins: [
    // Editor plugin - serves /_client/* and /_rsc/* for editor
    // Must be first to intercept before rwsdk
    editorPlugin({ workbookPath }),
    // Own React plugin - RWSDK will skip its React plugin since we have our own
    // The editor proxy (/_editor/client/*) strips HMR code for cross-origin loading
    react({
      exclude: [/node_modules/],
    }),
    // staleDepRetryPlugin(), // TODO: fix - causing Script error
    tunnelPlugin({ enabled: isDev }),
    dbTypesPlugin({ workbookPath }),
    workbookPlugin({ workbookPath }),
    cloudflare({
      viteEnvironment: { name: "worker" },
      // Persist Durable Object SQLite to .hands/db in workbook
      persistState: { path: path.join(workbookPath, ".hands/db") },
    }),
    redwood({
      // UI components are client-side (interactive)
      // Blocks are always server components (use server) - they can access @hands/db
      forceClientPaths: [
        path.resolve(workbookPath, "ui/**/*.tsx"),
      ],
    }),
    // Inject @source directives into styles.css for workbook content
    tailwindSourcePlugin({ workbookPath }),
    tailwindcss(),
  ],
  resolve: {
    // Ensure consistent resolution for slate and related packages
    dedupe: [
      "is-hotkey",
      "slate",
      "slate-dom",
      "slate-react",
      "slate-hyperscript",
      "react",
      "react-dom",
    ],
    alias: {
      // Use SSR variant of phosphor-icons (no React Context, works in workers)
      "@phosphor-icons/react": "@phosphor-icons/react/ssr",
      // Workbook paths
      "@ui": path.resolve(workbookPath, "ui"),
      "@/blocks": path.resolve(workbookPath, "pages/blocks"),
      // Runtime provides utils for shadcn components
      "@ui/lib/utils": path.resolve(__dirname, "src/lib/utils.ts"),
      // Hands core (primitives, types, actions, services)
      // NOTE: Subpath aliases must come BEFORE the base package alias
      "@hands/core/ui/view": path.resolve(__dirname, "../core/src/ui/view/index.ts"),
      "@hands/core/ui/action": path.resolve(__dirname, "../core/src/ui/action/index.ts"),
      "@hands/core/ui/data": path.resolve(__dirname, "../core/src/ui/data/index.ts"),
      "@hands/core/ui/components": path.resolve(__dirname, "../core/src/ui/components/index.ts"),
      "@hands/core/ui": path.resolve(__dirname, "../core/src/ui/index.ts"),
      "@hands/core/primitives": path.resolve(__dirname, "../core/src/primitives/index.ts"),
      "@hands/core/services": path.resolve(__dirname, "../core/src/services/index.ts"),
      "@hands/core/types": path.resolve(__dirname, "../core/src/types/index.ts"),
      "@hands/core/validation": path.resolve(__dirname, "../core/src/validation/index.ts"),
      "@hands/core/docs": path.resolve(__dirname, "../core/src/docs/stdlib.ts"),
      "@hands/core": path.resolve(__dirname, "../core/src/index.ts"),
      // Hands runtime
      "@hands/db": path.resolve(__dirname, "src/db/dev.ts"),
      "@hands/db/types": path.join(workbookPath, ".hands/db.d.ts"),
      "@hands/services": path.resolve(__dirname, "src/services/index.ts"),
      "@hands/runtime/components/PageStatic": path.resolve(__dirname, "src/components/PageStatic.tsx"),
      "@hands/runtime/pages/Page": path.resolve(__dirname, "src/pages/Page.tsx"),
      "@hands/runtime": path.resolve(__dirname, "src/types/index.ts"),
      "@hands/pages": path.join(workbookPath, ".hands/pages/index.tsx"),
      "@hands/actions": path.join(workbookPath, ".hands/actions/index.ts"),
      "@hands/actions/workflows": path.join(workbookPath, ".hands/actions/workflows.ts"),
      // Shared deps from runtime (workbook imports these but doesn't install them)
      "platejs/static": path.resolve(__dirname, "node_modules/platejs/dist/static/index.js"),
      "platejs/react": path.resolve(__dirname, "node_modules/platejs/dist/react/index.js"),
      "platejs": path.resolve(__dirname, "node_modules/platejs/dist/index.js"),
    },
  },
});
