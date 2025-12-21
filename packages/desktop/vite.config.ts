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
      routesDirectory: "./src/routes",
      generatedRouteTree: "./src/routeTree.gen.ts",
    }),
    react(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
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
