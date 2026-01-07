/**
 * Settings Popover
 *
 * Lightweight settings dropdown for web.
 * Theme + API key configuration.
 */

import { Gear, Key } from "@phosphor-icons/react";
import { Check, Sun, Moon, Monitor } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getStoredConfig, setStoredConfig, hasCustomApiKey, clearStoredConfig } from "@hands/agent/browser";
// Use lightweight imports to avoid pulling in heavy @hands/app deps
import { getTheme, setTheme, cn } from "@hands/app/light";

export function SettingsPopover() {
  const [open, setOpen] = useState(false);
  const [currentTheme, setCurrentTheme] = useState(() => getTheme());
  const [apiKey, setApiKey] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Check for custom API key on mount
  useEffect(() => {
    setHasKey(hasCustomApiKey());
    if (hasCustomApiKey()) {
      const config = getStoredConfig();
      if (config?.apiKey) {
        setApiKey(config.apiKey);
      }
    }
  }, []);

  // Refresh when opened
  useEffect(() => {
    if (open) {
      setHasKey(hasCustomApiKey());
      if (hasCustomApiKey()) {
        const config = getStoredConfig();
        if (config?.apiKey) {
          setApiKey(config.apiKey);
        }
      } else {
        setApiKey("");
      }
    }
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;

    const handleClick = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  const handleThemeChange = (themeId: string) => {
    setTheme(themeId);
    setCurrentTheme(themeId);
  };

  const handleSaveApiKey = () => {
    const trimmed = apiKey.trim();
    if (trimmed) {
      setStoredConfig({ type: "openrouter", apiKey: trimmed });
      setHasKey(true);
    }
  };

  const handleClearApiKey = () => {
    clearStoredConfig("openrouter");
    setApiKey("");
    setHasKey(false);
  };

  const themeOptions = [
    { id: "system", icon: Monitor },
    { id: "dark", icon: Moon },
    { id: "light", icon: Sun },
  ];

  return (
    <div className="relative">
      {/* Trigger button */}
      <button
        ref={buttonRef}
        onClick={() => setOpen(!open)}
        className={cn(
          "relative p-1.5 rounded-md transition-colors",
          open
            ? "bg-accent text-foreground"
            : "text-muted-foreground hover:text-foreground hover:bg-accent"
        )}
        title="Settings"
      >
        <Gear weight={open ? "fill" : "duotone"} className="h-4 w-4" />
      </button>

      {/* Popover */}
      {open && (
        <div
          ref={popoverRef}
          className="absolute right-0 top-full mt-2 w-72 bg-popover border border-border rounded-xl shadow-xl z-50"
        >
          {/* Theme section */}
          <div className="p-3 border-b border-border">
            <div className="text-xs font-medium text-muted-foreground mb-2">
              Theme
            </div>
            <div className="flex gap-1">
              {themeOptions.map((theme) => (
                <button
                  key={theme.id}
                  onClick={() => handleThemeChange(theme.id)}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-sm transition-colors",
                    currentTheme === theme.id
                      ? "bg-primary/15 text-primary"
                      : "hover:bg-accent text-muted-foreground hover:text-foreground"
                  )}
                >
                  <theme.icon className="h-4 w-4" />
                  {currentTheme === theme.id && (
                    <Check className="h-3 w-3" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* API Key section - only show when user has custom key */}
          {hasKey && (
            <div className="p-3">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-2">
                <Key weight="duotone" className="h-3.5 w-3.5" />
                <span>OpenRouter API Key</span>
                <span className="ml-auto text-green-500">Connected</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-or-v1-..."
                  className="flex-1 h-8 px-2.5 text-xs bg-background border border-border rounded-lg placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                />
                <button
                  onClick={handleSaveApiKey}
                  disabled={!apiKey.trim()}
                  className="h-8 px-3 text-xs bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Save
                </button>
              </div>
              <button
                onClick={handleClearApiKey}
                className="text-[11px] text-muted-foreground mt-2 hover:text-foreground transition-colors"
              >
                Remove key & use free tier
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
