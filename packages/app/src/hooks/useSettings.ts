/**
 * Settings Hook
 *
 * Manages user settings and API keys.
 * Uses the platform adapter for cross-platform storage.
 *
 * All AI calls go through OpenRouter - users only need one API key.
 */

import { useCallback, useEffect, useState } from "react";
import { usePlatform } from "../platform";
import { api } from "@/lib/api";
import { PORTS } from "@/lib/ports";

export interface Settings {
  // AI model (OpenRouter format: provider/model)
  model: string;

  // Server settings
  serverPort: number;

  // Theme
  theme: "dark" | "light" | "system";
}

// Single API key for OpenRouter
export interface ApiKeys {
  openrouter_api_key: string;
}

const defaultSettings: Settings = {
  model: "anthropic/claude-sonnet-4.5",
  serverPort: PORTS.OPENCODE,
  theme: "dark",
};

const defaultApiKeys: ApiKeys = {
  openrouter_api_key: "",
};

// All models available via OpenRouter
export const modelOptions: { value: string; label: string }[] = [
  // Anthropic
  { value: "anthropic/claude-opus-4.5", label: "Claude Opus 4.5" },
  { value: "anthropic/claude-sonnet-4.5", label: "Claude Sonnet 4.5" },
  { value: "anthropic/claude-haiku-4.5", label: "Claude Haiku 4.5" },
  // OpenAI
  { value: "openai/gpt-5.1", label: "GPT-5.1" },
  { value: "openai/gpt-5", label: "GPT-5" },
  { value: "openai/o1", label: "OpenAI o1" },
  // Google
  { value: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  { value: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash" },
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

        // Load API key
        const openrouterKey = await platform.storage.get<string>("openrouter_api_key");
        if (openrouterKey) {
          setApiKeys({ openrouter_api_key: openrouterKey });
        }
      } catch (error) {
        console.error("Failed to load settings:", error);
      } finally {
        setLoading(false);
      }
    }
    loadSettings();
  }, [platform.storage]);

  // Sync model config with OpenCode server
  const syncModelWithOpenCode = useCallback(async (model: string) => {
    try {
      // OpenRouter models use provider/model format - extract provider
      const [provider] = model.split("/");
      await api.config.setModel(provider || "openrouter", model);
      console.log(`Synced model to OpenCode: ${model}`);
    } catch (error) {
      console.error("Failed to sync model with OpenCode:", error);
    }
  }, []);

  // Sync current model settings
  const syncModel = useCallback(() => {
    syncModelWithOpenCode(settings.model);
  }, [settings.model, syncModelWithOpenCode]);

  // Update a single setting
  const updateSetting = useCallback(
    async <K extends keyof Settings>(key: K, value: Settings[K]) => {
      const newSettings = { ...settings, [key]: value };
      setSettings(newSettings);

      try {
        if (platform.storage) {
          await platform.storage.set("settings", newSettings);
        }

        // Sync with OpenCode when model changes
        if (key === "model") {
          await syncModelWithOpenCode(value as string);
        }
      } catch (error) {
        console.error("Failed to save setting:", error);
      }
    },
    [settings, syncModelWithOpenCode, platform.storage],
  );

  // Update the API key
  const updateApiKey = useCallback(async (value: string) => {
    setApiKeys({ openrouter_api_key: value });

    try {
      if (platform.storage) {
        // Store at root level so Rust can easily read it
        await platform.storage.set("openrouter_api_key", value);
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

  // Check if API key is set
  const hasApiKey = Boolean(apiKeys.openrouter_api_key);

  return {
    settings,
    apiKeys,
    loading,
    updateSetting,
    updateApiKey,
    saveSettings,
    resetSettings,
    hasApiKey,
    currentApiKey: apiKeys.openrouter_api_key,
    syncModel,
  };
}
