/**
 * Settings Hook
 *
 * Manages user settings and API keys.
 * Uses the platform adapter for cross-platform storage.
 *
 * All AI calls go through OpenRouter - users only need one API key.
 * Model is hardcoded in packages/agent (claude-opus-4.5 via OpenRouter).
 */

import { useCallback, useEffect, useState } from "react";
import { usePlatform } from "../platform";
import { PORTS } from "@/lib/ports";

export interface Settings {
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
  serverPort: PORTS.OPENCODE,
  theme: "dark",
};

const defaultApiKeys: ApiKeys = {
  openrouter_api_key: "",
};

export function useSettings() {
  const platform = usePlatform();
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [apiKeys, setApiKeys] = useState<ApiKeys>(defaultApiKeys);
  const [loading, setLoading] = useState(true);

  // Load settings on mount
  useEffect(() => {
    async function loadSettings() {
      if (!platform.storage) {
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

  // Update a single setting
  const updateSetting = useCallback(
    async <K extends keyof Settings>(key: K, value: Settings[K]) => {
      const newSettings = { ...settings, [key]: value };
      setSettings(newSettings);

      try {
        if (platform.storage) {
          await platform.storage.set("settings", newSettings);
        }
      } catch (error) {
        console.error("Failed to save setting:", error);
      }
    },
    [settings, platform.storage],
  );

  // Update the API key
  const updateApiKey = useCallback(async (value: string) => {
    setApiKeys({ openrouter_api_key: value });

    try {
      if (platform.storage) {
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
  };
}
