import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import {
  getStoredConfig,
  setStoredConfig,
  clearStoredConfig,
  getDefaultModel,
  resolveModelId,
  type ProviderConfig,
} from "../provider";

// Mock localStorage for tests
const mockStorage: Record<string, string> = {};

const originalLocalStorage = globalThis.localStorage;

beforeEach(() => {
  // Setup mock localStorage
  (globalThis as any).localStorage = {
    getItem: (key: string) => mockStorage[key] ?? null,
    setItem: (key: string, value: string) => {
      mockStorage[key] = value;
    },
    removeItem: (key: string) => {
      delete mockStorage[key];
    },
    clear: () => {
      Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
    },
  };
});

afterEach(() => {
  // Cleanup
  Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
  globalThis.localStorage = originalLocalStorage;
});

describe("provider", () => {
  describe("resolveModelId", () => {
    test("resolves OpenRouter model IDs", () => {
      expect(resolveModelId("openrouter", "anthropic/claude-sonnet-4")).toBe(
        "anthropic/claude-sonnet-4"
      );
    });

    test("resolves Anthropic model IDs with openrouter prefix", () => {
      expect(resolveModelId("anthropic", "claude-sonnet-4")).toBe(
        "anthropic/claude-sonnet-4"
      );
    });

    test("resolves OpenAI model IDs with openai prefix", () => {
      expect(resolveModelId("openai", "gpt-4")).toBe("openai/gpt-4");
    });
  });

  describe("getDefaultModel", () => {
    test("returns Claude Sonnet for openrouter", () => {
      const model = getDefaultModel("openrouter");

      expect(model).toBe("anthropic/claude-sonnet-4-20250514");
    });

    test("returns Claude Sonnet for anthropic", () => {
      const model = getDefaultModel("anthropic");

      expect(model).toBe("claude-sonnet-4-20250514");
    });

    test("returns GPT-4o for openai", () => {
      const model = getDefaultModel("openai");

      expect(model).toBe("gpt-4o");
    });
  });

  describe("config storage", () => {
    test("stores and retrieves config", () => {
      const config: ProviderConfig = {
        type: "openrouter",
        apiKey: "test-key",
      };

      setStoredConfig(config);
      const retrieved = getStoredConfig();

      expect(retrieved).toEqual(config);
    });

    test("returns null when no config stored", () => {
      const config = getStoredConfig();

      expect(config).toBeNull();
    });

    test("clears stored config", () => {
      setStoredConfig({ type: "openrouter", apiKey: "test-key" });
      clearStoredConfig();

      expect(getStoredConfig()).toBeNull();
    });
  });
});
