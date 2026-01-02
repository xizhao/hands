import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { redwood } from "rwsdk/vite";
import { defineConfig } from "vite";

export default defineConfig({
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
    react({ exclude: [/node_modules/] }),
    cloudflare({ viteEnvironment: { name: "worker" } }),
    redwood({
      // Force client paths for components that use "use client"
      forceClientPaths: [
        path.resolve(__dirname, "../core/src/ui/**/*.tsx"),
        path.resolve(__dirname, "../runtime/src/components/charts-client.tsx"),
        path.resolve(__dirname, "../runtime/src/nav/**/*.tsx"),
      ],
    }),
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
      // Use SSR variant of phosphor-icons
      "@phosphor-icons/react": "@phosphor-icons/react/ssr",
      // Hands core - must be directories to allow subpath imports
      "@hands/core/ui/view": path.resolve(__dirname, "../core/src/ui/view"),
      "@hands/core/ui/action": path.resolve(__dirname, "../core/src/ui/action"),
      "@hands/core/ui/data": path.resolve(__dirname, "../core/src/ui/data"),
      "@hands/core/ui/components": path.resolve(__dirname, "../core/src/ui/components"),
      "@hands/core/ui": path.resolve(__dirname, "../core/src/ui"),
      "@hands/core/primitives": path.resolve(__dirname, "../core/src/primitives"),
      "@hands/core/services": path.resolve(__dirname, "../core/src/services"),
      "@hands/core/types": path.resolve(__dirname, "../core/src/types"),
      "@hands/core/validation": path.resolve(__dirname, "../core/src/validation"),
      "@hands/core": path.resolve(__dirname, "../core/src"),
      // Runtime components
      "@hands/runtime/components/PageStatic": path.resolve(__dirname, "../runtime/src/components/PageStatic.tsx"),
      "@hands/runtime/nav": path.resolve(__dirname, "../runtime/src/nav/NavRoot.tsx"),
      "@hands/runtime": path.resolve(__dirname, "../runtime/src/types/index.ts"),
      // Editor plugins (used by PageStatic for SSR)
      "@hands/editor/plugins": path.resolve(__dirname, "../editor/src/plugins"),
      "@hands/editor": path.resolve(__dirname, "../editor/src"),
      // Shared deps from runtime
      "platejs/static": path.resolve(__dirname, "../runtime/node_modules/platejs/dist/static/index.js"),
      "platejs/react": path.resolve(__dirname, "../runtime/node_modules/platejs/dist/react/index.js"),
      "platejs": path.resolve(__dirname, "../runtime/node_modules/platejs/dist/index.js"),
    },
  },
});
