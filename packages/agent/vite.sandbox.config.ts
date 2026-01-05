import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  root: resolve(__dirname, "browser/sandbox"),
  server: {
    port: 5174,
  },
});
