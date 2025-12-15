import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { redwood } from "rwsdk/vite";
import { defineConfig } from "vite";
import { dbTypesPlugin } from "./src/vite-plugin-db-types";

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
  define: {
    "process.env.HANDS_WORKBOOK_PATH": JSON.stringify(workbookPath),
  },
  environments: {
    ssr: {},
  },
  plugins: [
    dbTypesPlugin({ workbookPath }),
    cloudflare({
      viteEnvironment: { name: "worker" },
    }),
    redwood({
      forceClientPaths: [path.resolve(workbookPath, "blocks/**/*.tsx")],
    }),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@/blocks": path.resolve(workbookPath, "blocks"),
      "@/hands/stdlib": path.resolve(__dirname, "../stdlib"),
      "@hands/db": path.resolve(__dirname, "src/db/dev.ts"), // Kysely + DO SQLite
      "@hands/db/types": path.join(workbookPath, ".hands/db.d.ts"), // Generated types
    },
  },
});
