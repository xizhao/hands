/**
 * Vite config for the EditorSandbox entry point
 *
 * Build: vite build --config vite.sandbox.config.ts
 * Dev:   vite --config vite.sandbox.config.ts
 *
 * In dev mode: Runtime proxies /sandbox/* to this server
 * In prod mode: Outputs to ../desktop/dist/editor/ for Tauri to serve
 */

import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const isDev = process.env.NODE_ENV !== "production";

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
    cors: true,
    headers: {
      "Access-Control-Allow-Origin": "*",
    },
  },
  optimizeDeps: {
    include: ["@codemirror/lang-javascript", "@uiw/react-codemirror"],
    exclude: ["@oxc-parser/binding-wasm32-wasi", "oxc-parser"],
    esbuildOptions: {
      target: "esnext",
    },
  },
});
