import path from "node:path";
import alias from "@rollup/plugin-alias";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

// SPA history fallback - all non-asset paths go to index.html
function spaHistoryFallback(): Plugin {
  return {
    name: "spa-history-fallback",
    configureServer(server) {
      // Return middleware that runs after Vite's built-in handling
      return () => {
        server.middlewares.use((req, res, next) => {
          // Only handle GET requests
          if (req.method !== "GET") return next();

          // Skip if it has a file extension (asset)
          if (req.url && req.url.includes(".")) return next();

          // Skip API routes or special paths
          if (req.url?.startsWith("/@") || req.url?.startsWith("/__")) return next();

          // Rewrite to index.html for client-side routing
          if (req.url && req.url !== "/" && req.url !== "/index.html") {
            req.url = "/index.html";
          }

          next();
        });
      };
    },
  };
}

export default defineConfig({
  plugins: [react(), spaHistoryFallback()],
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
          {
            find: "@hands/core/primitives/serialization",
            replacement: path.resolve(__dirname, "../core/src/primitives/serialization"),
          },
          { find: "@hands/core/types", replacement: path.resolve(__dirname, "../core/src/types") },
          { find: "@hands/core", replacement: path.resolve(__dirname, "../core/src") },
        ],
      }),
    ],
  },
  resolve: {
    // Prefer 'worker' condition for packages like decode-named-character-reference
    // that have worker-specific exports without DOM dependencies
    conditions: ["worker", "import", "module", "browser", "default"],
    // Ensure single instances of these packages (prevents context/store issues)
    dedupe: ["react", "react-dom", "jotai", "jotai-x", "platejs"],
    alias: [
      // Override @/lib/api to use browser API instead of opencode SDK
      { find: "@/lib/api", replacement: path.resolve(__dirname, "src/lib/api.ts") },

      // Map @opencode-ai/sdk types to our core agent types
      {
        find: "@opencode-ai/sdk/client",
        replacement: path.resolve(__dirname, "../agent/core/index.ts"),
      },

      // @hands/app uses @/ for its own imports - must come after specific overrides
      { find: /^@\/(.*)/, replacement: path.resolve(__dirname, "../app/src/$1") },

      // @hands/core explicit exports (from package.json)
      { find: "@hands/core/stdlib", replacement: path.resolve(__dirname, "../core/src/ui/index.ts") },
      { find: "@hands/core/stdlib/view", replacement: path.resolve(__dirname, "../core/src/ui/view/index.ts") },
      { find: "@hands/core/stdlib/action", replacement: path.resolve(__dirname, "../core/src/ui/action/index.ts") },
      { find: "@hands/core/stdlib/data", replacement: path.resolve(__dirname, "../core/src/ui/data/index.ts") },
      { find: "@hands/core/ui", replacement: path.resolve(__dirname, "../core/src/ui/index.ts") },
      { find: "@hands/core/ui/view", replacement: path.resolve(__dirname, "../core/src/ui/view/index.ts") },
      { find: "@hands/core/ui/action", replacement: path.resolve(__dirname, "../core/src/ui/action/index.ts") },
      { find: "@hands/core/ui/data", replacement: path.resolve(__dirname, "../core/src/ui/data/index.ts") },
      { find: "@hands/core/ui/components", replacement: path.resolve(__dirname, "../core/src/ui/components/index.ts") },
      // Primitives - specific paths must come BEFORE the base path
      { find: "@hands/core/primitives/plugin", replacement: path.resolve(__dirname, "../core/src/primitives/plugin.tsx") },
      { find: /^@hands\/core\/primitives\/serialization\/(.*)/, replacement: path.resolve(__dirname, "../core/src/primitives/serialization/$1") },
      { find: "@hands/core/primitives/serialization", replacement: path.resolve(__dirname, "../core/src/primitives/serialization/index.ts") },
      { find: "@hands/core/primitives", replacement: path.resolve(__dirname, "../core/src/primitives/index.ts") },
      { find: "@hands/core/types", replacement: path.resolve(__dirname, "../core/src/types/index.ts") },
      { find: "@hands/core/validation", replacement: path.resolve(__dirname, "../core/src/validation/index.ts") },
      { find: "@hands/core/docs", replacement: path.resolve(__dirname, "../core/src/docs/stdlib.ts") },
      { find: "@hands/core/services", replacement: path.resolve(__dirname, "../core/src/services/index.ts") },
      { find: "@hands/core/plugin", replacement: path.resolve(__dirname, "../core/src/primitives/plugin.tsx") },

      // @hands/editor explicit exports
      { find: "@hands/editor/sql", replacement: path.resolve(__dirname, "../editor/src/sql/index.ts") },
      { find: /^@hands\/editor\/(.*)/, replacement: path.resolve(__dirname, "../editor/src/$1") },

      // CSS imports
      { find: "@hands/app/styles.css", replacement: path.resolve(__dirname, "../app/src/index.css") },
      { find: "@hands/core/styles/theme.css", replacement: path.resolve(__dirname, "../core/src/styles/theme.css") },

      // @hands/agent exports
      { find: "@hands/agent/core", replacement: path.resolve(__dirname, "../agent/core/index.ts") },
      { find: "@hands/agent/browser", replacement: path.resolve(__dirname, "../agent/browser/index.ts") },

      // Base package aliases
      { find: "@hands/app", replacement: path.resolve(__dirname, "../app/src") },
      { find: "@hands/core", replacement: path.resolve(__dirname, "../core/src") },
      { find: "@hands/editor", replacement: path.resolve(__dirname, "../editor/src") },
      { find: "@hands/cloud", replacement: path.resolve(__dirname, "../cloud/src") },
    ],
  },
  server: {
    port: 5174,
    // Required headers for SharedArrayBuffer (needed by sqlite-wasm OPFS)
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  preview: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  optimizeDeps: {
    exclude: ["@sqlite.org/sqlite-wasm", "pyodide"],
  },
  appType: "spa",
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
