import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@hands/app": path.resolve(__dirname, "../app/src"),
      "@hands/core": path.resolve(__dirname, "../core/src"),
      "@hands/cloud": path.resolve(__dirname, "../cloud/src"),
    },
  },
  server: {
    port: 5174,
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
