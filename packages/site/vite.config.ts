import react from "@vitejs/plugin-react";
import { resolve } from "path";
import { defineConfig } from "vite";
import alias from "@rollup/plugin-alias";

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Prefer 'worker' condition for packages like decode-named-character-reference
    // that have worker-specific exports without DOM dependencies
    conditions: ["worker", "import", "module", "browser", "default"],
    alias: {
      "@": resolve(__dirname, "./src"),
      // Workspace package aliases for proper resolution
      "@hands/core/stdlib": resolve(__dirname, "../core/src/ui"),
      "@hands/core/plugin": resolve(__dirname, "../core/src/primitives/plugin.tsx"),
      "@hands/core/primitives/serialization": resolve(__dirname, "../core/src/primitives/serialization"),
      "@hands/core/primitives/plugin": resolve(__dirname, "../core/src/primitives/plugin.tsx"),
      "@hands/core/primitives": resolve(__dirname, "../core/src/primitives"),
      "@hands/core/types": resolve(__dirname, "../core/src/types"),
      "@hands/core/ui": resolve(__dirname, "../core/src/ui"),
      "@hands/core": resolve(__dirname, "../core/src"),
      "@hands/editor/plugins": resolve(__dirname, "../editor/src/plugins"),
      "@hands/editor/hooks": resolve(__dirname, "../editor/src/hooks"),
      "@hands/editor/ui": resolve(__dirname, "../editor/src/ui"),
      "@hands/editor/lib": resolve(__dirname, "../editor/src/lib"),
      "@hands/editor": resolve(__dirname, "../editor/src"),
    },
  },
  worker: {
    format: "es",
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
    plugins: () => [
      alias({
        entries: [
          { find: "@hands/core/primitives/serialization", replacement: resolve(__dirname, "../core/src/primitives/serialization") },
          { find: "@hands/core/types", replacement: resolve(__dirname, "../core/src/types") },
          { find: "@hands/core", replacement: resolve(__dirname, "../core/src") },
        ],
      }),
    ],
  },
  optimizeDeps: {
    exclude: ["sql.js"],
    esbuildOptions: {
      // Prefer 'worker' condition for pre-bundling
      conditions: ["worker", "module", "import", "default"],
    },
  },
  server: {
    port: 3000,
    headers: {
      // Required for sql.js WASM
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  build: {
    target: "esnext",
  },
});
