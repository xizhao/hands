import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: ".", // Serve from package root to access both demo/ and sandbox.html
  build: {
    target: "esnext", // Support top-level await
  },
  esbuild: {
    target: "esnext", // Support top-level await in dev
  },
  resolve: {
    alias: {
      "@hands/editor": resolve(__dirname, "src"),
      // Use WASM entry for oxc-parser in browser
      "oxc-parser": resolve(
        __dirname,
        "../../node_modules/.bun/oxc-parser@0.102.0/node_modules/oxc-parser/src-js/wasm.js",
      ),
      // Resolve WASM binding for browser
      "@oxc-parser/binding-wasm32-wasi": resolve(
        __dirname,
        "../../node_modules/@oxc-parser/binding-wasm32-wasi",
      ),
    },
  },
  server: {
    port: 5166, // Use 5166 to avoid conflicts with main app
    // Note: `bun run dev` uses dev-with-runtime.ts which opens the correct page from manifest
    // This open is only for `dev:editor-only` (no runtime)
    open: false,
  },
  optimizeDeps: {
    include: ["@codemirror/lang-javascript", "@uiw/react-codemirror"],
    // Exclude oxc-parser from optimization - WASM needs top-level await
    exclude: ["oxc-parser", "@oxc-parser/binding-wasm32-wasi"],
    esbuildOptions: {
      target: "esnext",
    },
  },
});
