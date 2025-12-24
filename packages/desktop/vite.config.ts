import fs from "node:fs";
import path from "node:path";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react-swc";
import { defineConfig, type Plugin } from "vite";

const host = process.env.TAURI_DEV_HOST;

// Plugin to serve pre-built editor sandbox from dist/editor/
function serveEditorSandbox(): Plugin {
  return {
    name: "serve-editor-sandbox",
    enforce: "pre",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        // Strip query string for file lookup
        const urlPath = req.url?.split("?")[0] || "";
        if (urlPath.startsWith("/editor/")) {
          const filePath = path.join(__dirname, "dist", urlPath);
          if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath);
            const ext = path.extname(filePath);
            const mimeTypes: Record<string, string> = {
              ".html": "text/html",
              ".js": "application/javascript",
              ".css": "text/css",
              ".wasm": "application/wasm",
            };
            res.setHeader("Content-Type", mimeTypes[ext] || "application/octet-stream");
            res.end(content);
            return;
          }
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [
    serveEditorSandbox(),
    TanStackRouterVite({
      routesDirectory: "../app/src/routes",
      generatedRouteTree: "../app/src/routeTree.gen.ts",
    }),
    react(),
  ],
  resolve: {
    alias: {
      // Point @/ to the app package where all components/hooks/routes live
      "@": path.resolve(__dirname, "../app/src"),
      // Explicit workspace package aliases
      "@hands/app": path.resolve(__dirname, "../app/src"),
      // Core package - all subpath exports from package.json
      "@hands/core/stdlib/view": path.resolve(__dirname, "../core/src/ui/view"),
      "@hands/core/stdlib/action": path.resolve(__dirname, "../core/src/ui/action"),
      "@hands/core/stdlib/data": path.resolve(__dirname, "../core/src/ui/data"),
      "@hands/core/stdlib": path.resolve(__dirname, "../core/src/ui"),
      "@hands/core/ui/view": path.resolve(__dirname, "../core/src/ui/view"),
      "@hands/core/ui/action": path.resolve(__dirname, "../core/src/ui/action"),
      "@hands/core/ui/data": path.resolve(__dirname, "../core/src/ui/data"),
      "@hands/core/ui/components": path.resolve(__dirname, "../core/src/ui/components"),
      "@hands/core/ui": path.resolve(__dirname, "../core/src/ui"),
      "@hands/core/primitives/plugin": path.resolve(__dirname, "../core/src/primitives/plugin.tsx"),
      "@hands/core/primitives": path.resolve(__dirname, "../core/src/primitives"),
      "@hands/core/plugin": path.resolve(__dirname, "../core/src/primitives/plugin.tsx"),
      "@hands/core/types": path.resolve(__dirname, "../core/src/types"),
      "@hands/core/validation": path.resolve(__dirname, "../core/src/validation"),
      "@hands/core/docs": path.resolve(__dirname, "../core/src/docs/stdlib.ts"),
      "@hands/core/services": path.resolve(__dirname, "../core/src/services"),
      "@hands/core": path.resolve(__dirname, "../core/src"),
      // Editor package - all subpath exports
      "@hands/editor/code-editor": path.resolve(__dirname, "../editor/src/code-editor"),
      "@hands/editor/plugins": path.resolve(__dirname, "../editor/src/plugins"),
      "@hands/editor/ui": path.resolve(__dirname, "../editor/src/ui"),
      "@hands/editor/hooks": path.resolve(__dirname, "../editor/src/hooks"),
      "@hands/editor/lib": path.resolve(__dirname, "../editor/src/lib"),
      "@hands/editor/test": path.resolve(__dirname, "../editor/src/test"),
      "@hands/editor/sql": path.resolve(__dirname, "../editor/src/sql"),
      "@hands/editor/table-editor": path.resolve(__dirname, "../editor/src/table-editor"),
      "@hands/editor": path.resolve(__dirname, "../editor/src"),
    },
  },
  define: {
    // Webpack compatibility shims for react-server-dom-webpack/client
    // These are required for Flight stream consumption in Vite
    __webpack_require__: "globalThis.__webpack_require__",
    // Polyfill process.env for libraries that expect Node environment
    "process.env": {},
  },
  optimizeDeps: {
    include: ["react-server-dom-webpack/client"],
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  build: {
    target: "esnext",
    minify: "esbuild",
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom"],
          ui: [
            "@radix-ui/react-dialog",
            "@radix-ui/react-dropdown-menu",
            "@radix-ui/react-scroll-area",
          ],
          markdown: ["react-markdown", "react-syntax-highlighter"],
        },
      },
    },
  },
});
