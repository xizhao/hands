/**
 * SettingsModal - Linear-style settings modal
 *
 * Opens from File > Preferences (Cmd+,)
 * Sections on left, content on right
 * All settings backed by Tauri store (persisted)
 */

import { Desktop, Info, Key, Keyboard, Palette, Robot } from "@phosphor-icons/react";
import { Check, ChevronDown, X } from "lucide-react";
import { useEffect, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useServer } from "@/hooks/useServer";
import { modelOptions, providerOptions, type Settings, useSettings } from "@/hooks/useSettings";
import { getTheme, getThemeList, setTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

type SettingsSection = "appearance" | "ai" | "shortcuts" | "about";

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

export function SettingsModal({ open, onClose }: SettingsModalProps) {
  const [activeSection, setActiveSection] = useState<SettingsSection>("appearance");

  // Close on escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const sections: { id: SettingsSection; label: string; icon: React.ElementType }[] = [
    { id: "appearance", label: "Appearance", icon: Palette },
    { id: "ai", label: "AI & Models", icon: Robot },
    { id: "shortcuts", label: "Shortcuts", icon: Keyboard },
    { id: "about", label: "About", icon: Info },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-[700px] h-[500px] bg-background border border-border rounded-xl shadow-2xl overflow-hidden flex">
        {/* Sidebar */}
        <div className="w-48 bg-muted/30 border-r border-border p-2 flex flex-col">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 py-2">
            Settings
          </div>
          <nav className="flex-1 space-y-0.5">
            {sections.map((section) => (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={cn(
                  "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors",
                  activeSection === section.id
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
                )}
              >
                <section.icon weight="duotone" className="h-4 w-4" />
                {section.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <h2 className="text-lg font-semibold">
              {sections.find((s) => s.id === activeSection)?.label}
            </h2>
            <button
              onClick={onClose}
              className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Section content */}
          <div className="flex-1 overflow-y-auto p-6">
            {activeSection === "appearance" && <AppearanceSettings />}
            {activeSection === "ai" && <AISettings />}
            {activeSection === "shortcuts" && <ShortcutsSettings />}
            {activeSection === "about" && <AboutSettings />}
          </div>
        </div>
      </div>
    </div>
  );
}

function AppearanceSettings() {
  const [currentTheme, setCurrentTheme] = useState(() => getTheme());
  const themes = getThemeList();

  const handleThemeChange = (themeId: string) => {
    setTheme(themeId);
    setCurrentTheme(themeId);
  };

  // Default options: system, dark, light
  const _defaultOptions = ["system", "dark", "light"];

  // Get palette colors for dark/light themes
  const darkTheme = themes.find((t) => t.id === "dark");
  const lightTheme = themes.find((t) => t.id === "light");

  // Other themes (exclude dark and light since they're in defaults)
  const otherThemes = themes.filter((t) => t.id !== "dark" && t.id !== "light");

  return (
    <div className="space-y-6">
      <SettingGroup title="Default" description="">
        <div className="flex gap-2">
          {/* System */}
          <button
            onClick={() => handleThemeChange("system")}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 p-3 rounded-lg border-2 transition-all",
              currentTheme === "system"
                ? "border-primary bg-primary/5"
                : "border-border hover:border-muted-foreground/50",
            )}
          >
            <Desktop weight="duotone" className="h-4 w-4" />
            <span className="text-sm font-medium">System</span>
            {currentTheme === "system" && <Check className="h-3 w-3 text-primary" />}
          </button>

          {/* Dark */}
          <button
            onClick={() => handleThemeChange("dark")}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 p-3 rounded-lg border-2 transition-all",
              currentTheme === "dark"
                ? "border-primary bg-primary/5"
                : "border-border hover:border-muted-foreground/50",
            )}
          >
            {darkTheme && (
              <div className="flex gap-0.5 rounded overflow-hidden">
                <div
                  className="h-4 w-4 rounded-sm"
                  style={{ backgroundColor: `hsl(${darkTheme.colors.background})` }}
                />
                <div
                  className="h-4 w-4 rounded-sm"
                  style={{ backgroundColor: `hsl(${darkTheme.colors.primary})` }}
                />
              </div>
            )}
            <span className="text-sm font-medium">Dark</span>
            {currentTheme === "dark" && <Check className="h-3 w-3 text-primary" />}
          </button>

          {/* Light */}
          <button
            onClick={() => handleThemeChange("light")}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 p-3 rounded-lg border-2 transition-all",
              currentTheme === "light"
                ? "border-primary bg-primary/5"
                : "border-border hover:border-muted-foreground/50",
            )}
          >
            {lightTheme && (
              <div className="flex gap-0.5 rounded overflow-hidden">
                <div
                  className="h-4 w-4 rounded-sm border border-border/50"
                  style={{ backgroundColor: `hsl(${lightTheme.colors.background})` }}
                />
                <div
                  className="h-4 w-4 rounded-sm"
                  style={{ backgroundColor: `hsl(${lightTheme.colors.primary})` }}
                />
              </div>
            )}
            <span className="text-sm font-medium">Light</span>
            {currentTheme === "light" && <Check className="h-3 w-3 text-primary" />}
          </button>
        </div>
      </SettingGroup>

      <SettingGroup title="Other Themes" description="">
        <div className="grid grid-cols-3 gap-2">
          {otherThemes.map((theme) => (
            <ThemeButton
              key={theme.id}
              theme={theme}
              isActive={currentTheme === theme.id}
              onClick={() => handleThemeChange(theme.id)}
            />
          ))}
        </div>
      </SettingGroup>
    </div>
  );
}

function ThemeButton({
  theme,
  isActive,
  onClick,
}: {
  theme: {
    id: string;
    name: string;
    isDark: boolean;
    colors: {
      background: string;
      foreground: string;
      primary: string;
      accent: string;
      muted: string;
    };
  };
  isActive: boolean;
  onClick: () => void;
}) {
  // Convert HSL string to CSS hsl() format
  const toHsl = (hsl: string) => `hsl(${hsl})`;

  return (
    <button
      onClick={onClick}
      className={cn(
        "p-2 rounded-lg border-2 text-left transition-all",
        isActive
          ? "border-primary bg-primary/5 ring-1 ring-primary/20"
          : "border-border hover:border-muted-foreground/50",
      )}
    >
      {/* Color palette preview */}
      <div className="flex gap-0.5 mb-2 rounded overflow-hidden">
        <div className="h-6 flex-1" style={{ backgroundColor: toHsl(theme.colors.background) }} />
        <div className="h-6 flex-1" style={{ backgroundColor: toHsl(theme.colors.muted) }} />
        <div className="h-6 flex-1" style={{ backgroundColor: toHsl(theme.colors.primary) }} />
        <div className="h-6 flex-1" style={{ backgroundColor: toHsl(theme.colors.accent) }} />
        <div className="h-6 flex-1" style={{ backgroundColor: toHsl(theme.colors.foreground) }} />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium truncate">{theme.name}</span>
        {isActive && <Check className="h-3 w-3 text-primary shrink-0" />}
      </div>
    </button>
  );
}

function AISettings() {
  const { settings, updateSetting, apiKeys, updateApiKey, syncModel } = useSettings();
  const { restartServer } = useServer();

  const currentModel = modelOptions[settings.provider]?.find((m) => m.value === settings.model);

  const getApiKeyField = () => {
    switch (settings.provider) {
      case "anthropic":
        return "anthropic_api_key" as const;
      case "openai":
        return "openai_api_key" as const;
      case "google":
        return "google_api_key" as const;
      default:
        return null;
    }
  };

  const apiKeyField = getApiKeyField();
  const currentApiKey = apiKeyField ? apiKeys[apiKeyField] : "";

  return (
    <div className="space-y-6">
      <SettingGroup title="AI Provider" description="Choose your preferred AI provider">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="w-full max-w-xs flex items-center justify-between h-9 px-3 text-sm bg-muted rounded-md border border-border hover:bg-muted/80 transition-colors">
              <span>{providerOptions.find((p) => p.value === settings.provider)?.label}</span>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            {providerOptions.map((opt) => (
              <DropdownMenuItem
                key={opt.value}
                onClick={() => updateSetting("provider", opt.value as Settings["provider"])}
                className="flex items-center justify-between"
              >
                <span>{opt.label}</span>
                {settings.provider === opt.value && <Check className="h-4 w-4" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </SettingGroup>

      <SettingGroup title="Model" description="Select the AI model to use">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="w-full max-w-xs flex items-center justify-between h-9 px-3 text-sm bg-muted rounded-md border border-border hover:bg-muted/80 transition-colors">
              <span className="truncate">{currentModel?.label || settings.model}</span>
              <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64 max-h-64 overflow-y-auto">
            {modelOptions[settings.provider]?.map((opt) => (
              <DropdownMenuItem
                key={opt.value}
                onClick={() => updateSetting("model", opt.value)}
                className="flex items-center justify-between"
              >
                <span>{opt.label}</span>
                {settings.model === opt.value && <Check className="h-4 w-4" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </SettingGroup>

      {apiKeyField && (
        <SettingGroup
          title="API Key"
          description={`Your ${providerOptions.find((p) => p.value === settings.provider)?.label} API key`}
        >
          <div className="flex items-center gap-2 max-w-md">
            <div className="relative flex-1">
              <Key
                weight="duotone"
                className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
              />
              <input
                type="password"
                value={currentApiKey}
                onChange={(e) => updateApiKey(apiKeyField, e.target.value)}
                placeholder="sk-..."
                className="w-full h-9 pl-9 pr-3 text-sm bg-muted border border-border rounded-md placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring font-mono"
              />
            </div>
            <button
              onClick={async () => {
                await restartServer();
                setTimeout(() => syncModel(), 1000);
              }}
              className="h-9 px-3 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
            >
              Save
            </button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Your API key is stored locally and never sent to our servers.
          </p>
        </SettingGroup>
      )}
    </div>
  );
}

function ShortcutsSettings() {
  const shortcuts = [
    { label: "Open Settings", keys: ["Cmd", ","] },
    { label: "New Session", keys: ["Cmd", "N"] },
    { label: "Toggle Sidebar", keys: ["Cmd", "B"] },
    { label: "Search", keys: ["Cmd", "K"] },
    { label: "Focus Chat", keys: ["Cmd", "L"] },
    { label: "Clear Chat", keys: ["Cmd", "Shift", "K"] },
  ];

  return (
    <div className="space-y-6">
      <SettingGroup title="Keyboard Shortcuts" description="Common keyboard shortcuts">
        <div className="space-y-2">
          {shortcuts.map((shortcut) => (
            <div
              key={shortcut.label}
              className="flex items-center justify-between py-2 border-b border-border/50 last:border-0"
            >
              <span className="text-sm">{shortcut.label}</span>
              <div className="flex items-center gap-1">
                {shortcut.keys.map((key, i) => (
                  <span key={i}>
                    <kbd className="px-2 py-0.5 text-xs bg-muted border border-border rounded">
                      {key === "Cmd" ? "⌘" : key === "Shift" ? "⇧" : key}
                    </kbd>
                    {i < shortcut.keys.length - 1 && (
                      <span className="text-muted-foreground mx-0.5">+</span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </SettingGroup>
    </div>
  );
}

function AboutSettings() {
  return (
    <div className="space-y-6">
      <div className="text-center py-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 text-white text-2xl font-bold mb-4">
          H
        </div>
        <h3 className="text-xl font-semibold">Hands</h3>
        <p className="text-sm text-muted-foreground">Version 0.1.0</p>
      </div>

      <SettingGroup title="Links" description="">
        <div className="space-y-2">
          <a
            href="https://hands.dev"
            target="_blank"
            rel="noopener noreferrer"
            className="block text-sm text-primary hover:underline"
          >
            Website
          </a>
          <a
            href="https://github.com/hands-dev/hands"
            target="_blank"
            rel="noopener noreferrer"
            className="block text-sm text-primary hover:underline"
          >
            GitHub
          </a>
          <a
            href="https://hands.dev/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="block text-sm text-primary hover:underline"
          >
            Documentation
          </a>
        </div>
      </SettingGroup>
    </div>
  );
}

function SettingGroup({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-medium">{title}</h3>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      {children}
    </div>
  );
}
