import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    include: ["src/**/*.test.ts"],
    exclude: ["src/**/*.test.tsx"],
    environment: "node",
  },
  resolve: {
    alias: {
      // Mock all worker imports - match the full path pattern
      [path.resolve(__dirname, "src/workers/markdown.worker?worker")]: path.resolve(__dirname, "src/test/__mocks__/markdown-worker-mock.ts"),
    },
  },
});
