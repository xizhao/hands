/**
 * Settings Hook
 *
 * Manages user settings and API keys.
 * Uses the platform adapter for cross-platform storage.
 */

import { useCallback, useEffect, useState } from "react";
import { usePlatform } from "../platform";
import { api } from "@/lib/api";
import { PORTS } from "@/lib/ports";

export interface Settings {
  // AI Provider settings
  provider: "anthropic" | "openai" | "amazon-bedrock" | "google" | "openrouter";
  model: string;

  // Server settings
  serverPort: number;

  // Theme
  theme: "dark" | "light" | "system";
}

// API keys stored separately with their env var names
export interface ApiKeys {
  anthropic_api_key: string;
  openai_api_key: string;
  google_api_key: string;
}

const defaultSettings: Settings = {
  provider: "anthropic",
  model: "claude-sonnet-4-5-20250929",
  serverPort: PORTS.OPENCODE,
  theme: "dark",
};

const defaultApiKeys: ApiKeys = {
  anthropic_api_key: "",
  openai_api_key: "",
  google_api_key: "",
};

// Model options per provider (updated December 2025)
export const modelOptions: Record<Settings["provider"], { value: string; label: string }[]> = {
  anthropic: [
    { value: "claude-opus-4-5-20251124", label: "Claude Opus 4.5" },
    { value: "claude-sonnet-4-5-20250929", label: "Claude Sonnet 4.5" },
    { value: "claude-haiku-4-5-20251015", label: "Claude Haiku 4.5" },
    { value: "claude-opus-4-1-20250805", label: "Claude Opus 4.1" },
    { value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
    { value: "claude-opus-4-20250514", label: "Claude Opus 4" },
  ],
  openai: [
    { value: "gpt-5.1", label: "GPT-5.1" },
    { value: "gpt-5", label: "GPT-5" },
    { value: "gpt-5-mini", label: "GPT-5 Mini" },
    { value: "gpt-5-nano", label: "GPT-5 Nano" },
    { value: "gpt-5-codex", label: "GPT-5 Codex" },
    { value: "gpt-4o", label: "GPT-4o" },
    { value: "o1", label: "o1" },
    { value: "o1-mini", label: "o1 Mini" },
  ],
  "amazon-bedrock": [
    { value: "anthropic.claude-opus-4-5-20251124-v1:0", label: "Claude Opus 4.5 (Bedrock)" },
    { value: "anthropic.claude-sonnet-4-5-20250929-v1:0", label: "Claude Sonnet 4.5 (Bedrock)" },
    { value: "anthropic.claude-sonnet-4-20250514-v1:0", label: "Claude Sonnet 4 (Bedrock)" },
    { value: "anthropic.claude-opus-4-20250514-v1:0", label: "Claude Opus 4 (Bedrock)" },
  ],
  google: [
    { value: "gemini-3.0-pro", label: "Gemini 3.0 Pro" },
    { value: "gemini-3.0-deep-think", label: "Gemini 3.0 Deep Think" },
    { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
    { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
    { value: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite" },
  ],
  openrouter: [
    { value: "anthropic/claude-opus-4.5", label: "Claude Opus 4.5" },
    { value: "anthropic/claude-sonnet-4.5", label: "Claude Sonnet 4.5" },
    { value: "openai/gpt-5.1", label: "GPT-5.1" },
    { value: "openai/gpt-5", label: "GPT-5" },
    { value: "google/gemini-3.0-pro", label: "Gemini 3.0 Pro" },
    { value: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  ],
};

export const providerOptions: { value: Settings["provider"]; label: string }[] = [
  { value: "anthropic", label: "Anthropic" },
  { value: "openai", label: "OpenAI" },
  { value: "amazon-bedrock", label: "Amazon Bedrock" },
  { value: "google", label: "Google" },
  { value: "openrouter", label: "OpenRouter" },
];

export function useSettings() {
  const platform = usePlatform();
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [apiKeys, setApiKeys] = useState<ApiKeys>(defaultApiKeys);
  const [loading, setLoading] = useState(true);

  // Load settings on mount
  useEffect(() => {
    async function loadSettings() {
      if (!platform.storage) {
        // On web, use defaults (could also use localStorage via platform.storage)
        setLoading(false);
        return;
      }

      try {
        const saved = await platform.storage.get<Settings>("settings");
        if (saved) {
          setSettings({ ...defaultSettings, ...saved });
        }

        // Load API keys individually (stored at root level for Rust to read)
        const keys: ApiKeys = { ...defaultApiKeys };
        for (const key of Object.keys(defaultApiKeys) as (keyof ApiKeys)[]) {
          const value = await platform.storage.get<string>(key);
          if (value) {
            keys[key] = value;
          }
        }
        setApiKeys(keys);
      } catch (error) {
        console.error("Failed to load settings:", error);
      } finally {
        setLoading(false);
      }
    }
    loadSettings();
  }, [platform.storage]);

  // Sync model config with OpenCode server
  const syncModelWithOpenCode = useCallback(async (provider: string, model: string) => {
    try {
      await api.config.setModel(provider, model);
      console.log(`Synced model to OpenCode: ${provider}/${model}`);
    } catch (error) {
      console.error("Failed to sync model with OpenCode:", error);
    }
  }, []);

  // Sync current model settings
  const syncModel = useCallback(() => {
    syncModelWithOpenCode(settings.provider, settings.model);
  }, [settings.provider, settings.model, syncModelWithOpenCode]);

  // Update a single setting
  const updateSetting = useCallback(
    async <K extends keyof Settings>(key: K, value: Settings[K]) => {
      const newSettings = { ...settings, [key]: value };

      // If provider changes, reset model to first option for that provider
      if (key === "provider") {
        const models = modelOptions[value as Settings["provider"]];
        if (models && models.length > 0) {
          newSettings.model = models[0].value;
        }
      }

      setSettings(newSettings);

      try {
        if (platform.storage) {
          await platform.storage.set("settings", newSettings);
        }

        // Sync with OpenCode when provider or model changes
        if (key === "provider" || key === "model") {
          await syncModelWithOpenCode(newSettings.provider, newSettings.model);
        }
      } catch (error) {
        console.error("Failed to save setting:", error);
      }
    },
    [settings, syncModelWithOpenCode, platform.storage],
  );

  // Update an API key
  const updateApiKey = useCallback(async <K extends keyof ApiKeys>(key: K, value: string) => {
    setApiKeys((prev) => ({ ...prev, [key]: value }));

    try {
      if (platform.storage) {
        // Store at root level so Rust can easily read it
        await platform.storage.set(key, value);
      }
    } catch (error) {
      console.error("Failed to save API key:", error);
    }
  }, [platform.storage]);

  // Save all settings at once
  const saveSettings = useCallback(async (newSettings: Settings) => {
    setSettings(newSettings);
    try {
      if (platform.storage) {
        await platform.storage.set("settings", newSettings);
      }
    } catch (error) {
      console.error("Failed to save settings:", error);
    }
  }, [platform.storage]);

  // Reset to defaults
  const resetSettings = useCallback(async () => {
    setSettings(defaultSettings);
    try {
      if (platform.storage) {
        await platform.storage.set("settings", defaultSettings);
      }
    } catch (error) {
      console.error("Failed to reset settings:", error);
    }
  }, [platform.storage]);

  // Check if any API key is set
  const hasApiKey = Boolean(
    apiKeys.anthropic_api_key || apiKeys.openai_api_key || apiKeys.google_api_key,
  );

  // Get API key for current provider
  const currentApiKey = (() => {
    switch (settings.provider) {
      case "anthropic":
        return apiKeys.anthropic_api_key;
      case "openai":
        return apiKeys.openai_api_key;
      case "google":
        return apiKeys.google_api_key;
      default:
        return "";
    }
  })();

  return {
    settings,
    apiKeys,
    loading,
    updateSetting,
    updateApiKey,
    saveSettings,
    resetSettings,
    hasApiKey,
    currentApiKey,
    syncModel,
  };
}
