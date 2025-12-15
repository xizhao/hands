import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { redwood } from "rwsdk/vite";
import { defineConfig } from "vite";

export default defineConfig({
  environments: {
    ssr: {},
  },
  plugins: [
    cloudflare({
      viteEnvironment: { name: "worker" },
    }),
    redwood({
      forceClientPaths: [
        path.resolve(process.env.HANDS_WORKBOOK_PATH ?? "", "blocks/**/*.tsx"),
      ],
    }),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@/blocks": path.resolve(process.env.HANDS_WORKBOOK_PATH ?? "", "blocks"), // running dev server in workbook
      "@/hands/stdlib": path.resolve(__dirname, "../stdlib"), // running dev server in workbook
    },
  },
});
