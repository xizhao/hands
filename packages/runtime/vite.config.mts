import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { redwood } from "rwsdk/vite";
import { defineConfig } from "vite";
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
  },
  plugins: [
    tunnelPlugin({ enabled: isDev }),
    dbTypesPlugin({ workbookPath }),
    pagesPlugin({ workbookPath }),
    cloudflare({
      viteEnvironment: { name: "worker" },
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
      "@hands/pages": path.join(workbookPath, ".hands/pages/index.tsx"),
      "@hands/stdlib": path.resolve(__dirname, "../stdlib/src/index.ts"),
      // Shared deps from runtime (workbook imports these but doesn't install them)
      "platejs/static": path.resolve(__dirname, "node_modules/platejs/dist/static/index.js"),
      "platejs/react": path.resolve(__dirname, "node_modules/platejs/dist/react/index.js"),
      "platejs": path.resolve(__dirname, "node_modules/platejs/dist/index.js"),
    },
    // Resolve deps from workbook first, then runtime
    modules: [
      path.join(workbookPath, "node_modules"),
      "node_modules",
    ],
  },
});
