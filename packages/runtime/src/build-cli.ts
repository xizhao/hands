#!/usr/bin/env bun
/**
 * Build CLI - Compiles a workbook for production deployment
 *
 * This file is bundled with `bun build --minify` (NOT --compile) to create
 * a tree-shaken JS bundle. Native modules like lightningcss load at runtime.
 *
 * Usage: bun builder.js <workbook-path> <output-dir>
 */

import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

// Import all vite plugins so they get bundled
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { redwood } from "rwsdk/vite";

// Import local plugins
import { dbTypesPlugin } from "./vite-plugin-db-types";
import { editorPlugin } from "./vite-plugin-editor";
import { tailwindSourcePlugin } from "./vite-plugin-tailwind-source";
import { workbookPlugin } from "./vite-plugin-workbook";

// Get the runtime source directory (where this file lives when compiled)
const runtimeDir = dirname(fileURLToPath(import.meta.url));

async function buildWorkbook(workbookPath: string, outDir: string): Promise<void> {
  if (!existsSync(workbookPath)) {
    throw new Error(`Workbook not found: ${workbookPath}`);
  }

  console.log(`[builder] Building workbook: ${workbookPath}`);
  console.log(`[builder] Output: ${outDir}`);
  console.log(`[builder] Runtime: ${runtimeDir}`);

  // Clean output directory
  if (existsSync(outDir)) {
    rmSync(outDir, { recursive: true, force: true });
  }
  mkdirSync(outDir, { recursive: true });

  // Build with inlined vite config
  await build({
    root: runtimeDir,
    mode: "production",
    logLevel: "info",

    build: {
      outDir,
      emptyOutDir: true,
      commonjsOptions: {
        include: [/node_modules/],
      },
      rollupOptions: {
        external: ["cloudflare:workers"],
      },
    },

    define: {
      "process.env.HANDS_WORKBOOK_PATH": JSON.stringify(workbookPath),
    },

    environments: {
      ssr: {
        optimizeDeps: {
          noDiscovery: true,
        },
      },
      worker: {
        optimizeDeps: {
          include: [
            "is-hotkey",
            "slate",
            "slate-dom",
            "slate-react",
            "slate-hyperscript",
            "platejs",
            "platejs/static",
            "tailwind-merge",
            "clsx",
            "class-variance-authority",
          ],
          esbuildOptions: {
            mainFields: ["module", "main"],
          },
        },
        resolve: {
          mainFields: ["module", "main", "browser"],
          dedupe: ["is-hotkey", "slate", "slate-dom", "slate-react"],
        },
      },
    },

    ssr: {
      external: ["cloudflare:workers"],
      noExternal: [
        "is-hotkey",
        "slate",
        "slate-dom",
        "slate-react",
        "slate-hyperscript",
        /^@platejs\//,
        "platejs",
        /^platejs\//,
        /^lodash/,
      ],
      optimizeDeps: {
        include: [
          "is-hotkey",
          "slate",
          "slate-dom",
          "slate-react",
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
      // Editor plugin for /_client/* and /_rsc/*
      editorPlugin({ workbookPath }),
      // React plugin
      react({
        exclude: [/node_modules/],
      }),
      // DB types generation
      dbTypesPlugin({ workbookPath }),
      // Workbook plugin (pages, actions, etc.)
      workbookPlugin({ workbookPath }),
      // Cloudflare worker plugin
      cloudflare({
        viteEnvironment: { name: "worker" },
        persistState: { path: join(workbookPath, ".hands/db") },
      }),
      // RWSDK for RSC
      redwood({
        forceClientPaths: [resolve(workbookPath, "ui/**/*.tsx")],
      }),
      // Tailwind source injection
      tailwindSourcePlugin({ workbookPath }),
      // Tailwind CSS
      tailwindcss(),
    ],

    resolve: {
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
        // SSR variant of phosphor-icons
        "@phosphor-icons/react": "@phosphor-icons/react/ssr",
        // Workbook paths
        "@ui": resolve(workbookPath, "ui"),
        "@/blocks": resolve(workbookPath, "pages/blocks"),
        // Runtime utils
        "@ui/lib/utils": resolve(runtimeDir, "lib/utils.ts"),
        // Hands core
        "@hands/core/ui/view": resolve(runtimeDir, "../core/src/ui/view/index.ts"),
        "@hands/core/ui/action": resolve(runtimeDir, "../core/src/ui/action/index.ts"),
        "@hands/core/ui/data": resolve(runtimeDir, "../core/src/ui/data/index.ts"),
        "@hands/core/ui/components": resolve(runtimeDir, "../core/src/ui/components/index.ts"),
        "@hands/core/ui": resolve(runtimeDir, "../core/src/ui/index.ts"),
        "@hands/core/primitives": resolve(runtimeDir, "../core/src/primitives/index.ts"),
        "@hands/core/services": resolve(runtimeDir, "../core/src/services/index.ts"),
        "@hands/core/types": resolve(runtimeDir, "../core/src/types/index.ts"),
        "@hands/core/validation": resolve(runtimeDir, "../core/src/validation/index.ts"),
        "@hands/core/docs": resolve(runtimeDir, "../core/src/docs/stdlib.ts"),
        "@hands/core": resolve(runtimeDir, "../core/src/index.ts"),
        // Hands runtime
        "@hands/db": resolve(runtimeDir, "db/dev.ts"),
        "@hands/db/types": join(workbookPath, ".hands/db.d.ts"),
        "@hands/services": resolve(runtimeDir, "services/index.ts"),
        "@hands/runtime/components/PageStatic": resolve(runtimeDir, "components/PageStatic.tsx"),
        "@hands/runtime/pages/Page": resolve(runtimeDir, "pages/Page.tsx"),
        "@hands/runtime": resolve(runtimeDir, "types/index.ts"),
        "@hands/pages": join(workbookPath, ".hands/pages/index.tsx"),
        "@hands/actions": join(workbookPath, ".hands/actions/index.ts"),
        "@hands/actions/workflows": join(workbookPath, ".hands/actions/workflows.ts"),
        // Editor plugins
        "@hands/editor/plugins": resolve(runtimeDir, "../editor/src/plugins"),
        "@hands/editor": resolve(runtimeDir, "../editor/src"),
        // Shared deps
        "platejs/static": resolve(runtimeDir, "../node_modules/platejs/dist/static/index.js"),
        "platejs/react": resolve(runtimeDir, "../node_modules/platejs/dist/react/index.js"),
        platejs: resolve(runtimeDir, "../node_modules/platejs/dist/index.js"),
      },
    },
  });

  console.log("[builder] Build completed successfully");
}

// CLI entry point
async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error("Usage: bun builder.js <workbook-path> <output-dir>");
    process.exit(1);
  }

  const [workbookPath, outDir] = args;

  try {
    await buildWorkbook(resolve(workbookPath), resolve(outDir));
    process.exit(0);
  } catch (err) {
    console.error("[builder] Build failed:", err);
    process.exit(1);
  }
}

main();
