import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    include: ["src/**/*.test.ts"],
    exclude: ["src/**/*.test.tsx"],
    // Run in browser for real worker support
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      instances: [{ browser: 'chromium' }],
    },
  },
  resolve: {
    alias: {
      // Mock the worker import for tests - the actual worker logic is tested separately
      "../workers/markdown.worker?worker": path.resolve(__dirname, "src/test/__mocks__/markdown-worker-mock.ts"),
    },
  },
  // Enable worker plugin for proper handling
  worker: {
    format: "es",
  },
});
