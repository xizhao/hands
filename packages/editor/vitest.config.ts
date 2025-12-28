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
    alias: [
      // Mock worker imports - the ?worker suffix is a Vite convention
      // Use regex to match any path ending with .worker?worker
      {
        find: /^(.*)\.worker\?worker$/,
        replacement: path.resolve(__dirname, "src/test/__mocks__/markdown-worker-mock.ts"),
      },
    ],
  },
});
