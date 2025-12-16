import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { redwood } from "rwsdk/vite";
import { defineConfig } from "vite";
import { blocksPlugin } from "./src/vite-plugin-blocks";
import { dbTypesPlugin } from "./src/vite-plugin-db-types";
import { pagesPlugin } from "./src/vite-plugin-pages";
import { tunnelPlugin } from "./src/vite-plugin-tunnel";

const isDev = process.env.NODE_ENV !== "production";
const workbookPath = process.env.HANDS_WORKBOOK_PATH ?? "";

if (!isDev) {
  throw new Error(
    "Production builds not yet supported. TODO: implement @hands/db with Durable Objects."
  );
}

if (!workbookPath) {
  throw new Error("HANDS_WORKBOOK_PATH environment variable is required");
}

export default defineConfig({
  server: {
    host: true, // Expose to LAN
    allowedHosts: [".trycloudflare.com"], // Allow tunnel requests
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
        ],
      },
    },
  },
  ssr: {
    // Force bundling of CJS packages that use `exports` (not compatible with ESM worker)
    noExternal: [
      "is-hotkey",
      "slate",
      "slate-dom",
      "slate-react",
      /^@platejs\//,
      "platejs",
    ],
  },
  plugins: [
    tunnelPlugin({ enabled: isDev }),
    blocksPlugin({ workbookPath }),
    dbTypesPlugin({ workbookPath }),
    pagesPlugin({ workbookPath }),
    cloudflare({
      viteEnvironment: { name: "worker" },
      // Persist Durable Object SQLite to .hands/db in workbook
      persistState: { path: path.join(workbookPath, ".hands/db") },
    }),
    redwood({
      // Blocks are server components by default
      // ui/ components with "use client" need to be registered for client bundling
      forceClientPaths: [path.resolve(workbookPath, "ui/**/*.tsx")],
    }),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      // Workbook paths
      "@ui": path.resolve(workbookPath, "ui"),
      "@/blocks": path.resolve(workbookPath, "blocks"),
      // Runtime provides utils for shadcn components
      "@ui/lib/utils": path.resolve(__dirname, "src/lib/utils.ts"),
      // Hands runtime
      "@hands/db": path.resolve(__dirname, "src/db/dev.ts"),
      "@hands/db/types": path.join(workbookPath, ".hands/db.d.ts"),
      "@hands/runtime": path.resolve(__dirname, "src/types/index.ts"),
      "@hands/pages": path.join(workbookPath, ".hands/pages/index.tsx"),
      // Shared deps from runtime (workbook imports these but doesn't install them)
      "platejs/static": path.resolve(__dirname, "node_modules/platejs/dist/static/index.js"),
      "platejs/react": path.resolve(__dirname, "node_modules/platejs/dist/react/index.js"),
      "platejs": path.resolve(__dirname, "node_modules/platejs/dist/index.js"),
    },
  },
});
