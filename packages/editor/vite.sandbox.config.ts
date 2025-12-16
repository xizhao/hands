/**
 * Vite config for the EditorSandbox entry point
 *
 * Build: vite build --config vite.sandbox.config.ts
 * Dev:   vite --config vite.sandbox.config.ts
 *
 * Standalone dev mode:
 *   WORKBOOK_PATH=/path/to/workbook vite --config vite.sandbox.config.ts
 *   Provides /api/source/* endpoints for file I/O
 *
 * With runtime:
 *   Runtime proxies /sandbox/* to this server
 *
 * Prod mode:
 *   Outputs to ../desktop/dist/editor/ for Tauri to serve
 */

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { defineConfig } from "vite";
import { devApiPlugin } from "./src/vite-plugin-dev-api";

const isDev = process.env.NODE_ENV !== "production";
const workbookPath = process.env.WORKBOOK_PATH;
const harnessUrl = process.env.HARNESS_URL || "http://localhost:5173";

export default defineConfig({
  define: {
    // Make harness URL available to client code
    "import.meta.env.HARNESS_URL": JSON.stringify(harnessUrl),
    "import.meta.env.STANDALONE_MODE": JSON.stringify(isDev && !!workbookPath),
  },
  plugins: [
    react(),
    tailwindcss(),
    // Only enable dev API when workbook path is set (standalone mode)
    ...(isDev && workbookPath ? [devApiPlugin({ workbookPath })] : []),
  ],
  // In dev: no base (runtime proxies /sandbox/* -> /)
  // In prod: /editor/ for Tauri asset serving
  base: isDev ? "/" : "/editor/",
  build: {
    target: "esnext",
    outDir: resolve(__dirname, "../desktop/dist/editor"),
    emptyDirOnBuild: true,
    rollupOptions: {
      input: {
        sandbox: resolve(__dirname, "sandbox.html"),
      },
    },
  },
  esbuild: {
    target: "esnext",
  },
  resolve: {
    alias: {
      "@hands/editor": resolve(__dirname, "src"),
    },
  },
  server: {
    // Port is set via CLI when started by runtime (--port 55400)
    // Default to 5167 for standalone dev
    port: 5167,
    hmr: false, // Disable HMR - blocks are rendered via RSC from runtime
    cors: true,
    headers: {
      "Access-Control-Allow-Origin": "*",
    },
    hmr: false,
  },
  optimizeDeps: {
    include: ["@codemirror/lang-javascript", "@uiw/react-codemirror"],
    exclude: ["@oxc-parser/binding-wasm32-wasi", "oxc-parser"],
    esbuildOptions: {
      target: "esnext",
    },
  },
});
