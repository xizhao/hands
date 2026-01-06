/**
 * API Key Prompt
 *
 * Inline component shown in chat when API key is missing.
 * Allows users to enter their key directly in the chat flow.
 */

import { Key } from "lucide-react";
import { useState } from "react";
import { useApiKey } from "@/hooks/useApiKey";
import { cn } from "@/lib/utils";

interface ApiKeyPromptProps {
  /** Compact mode for sidebar */
  compact?: boolean;
  /** Optional callback after key is saved */
  onSaved?: () => void;
}

export function ApiKeyPrompt({ compact = false, onSaved }: ApiKeyPromptProps) {
  const apiKeyContext = useApiKey();
  const [inputValue, setInputValue] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  if (!apiKeyContext) {
    // Fallback if no context - show link to settings
    return (
      <div className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20",
        compact ? "text-xs" : "text-sm"
      )}>
        <Key className="h-4 w-4 text-yellow-500" />
        <span className="text-yellow-600 dark:text-yellow-400">
          API key required. Add your OpenRouter key in settings.
        </span>
      </div>
    );
  }

  const handleSave = () => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;

    setIsSaving(true);
    apiKeyContext.saveApiKey(trimmed);
    setSaved(true);
    setIsSaving(false);

    // Call onSaved callback
    onSaved?.();
    apiKeyContext.onApiKeySaved?.();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    }
  };

  if (saved) {
    return (
      <div className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-lg bg-green-500/10 border border-green-500/20",
        compact ? "text-xs" : "text-sm"
      )}>
        <Key className="h-4 w-4 text-green-500" />
        <span className="text-green-600 dark:text-green-400">
          API key saved! Retrying your message...
        </span>
      </div>
    );
  }

  return (
    <div className={cn(
      "rounded-lg bg-card border border-border p-3 space-y-3",
      compact ? "text-xs" : "text-sm"
    )}>
      <div className="flex items-center gap-2 text-muted-foreground">
        <Key className="h-4 w-4 text-yellow-500" />
        <span>Enter your OpenRouter API key to continue</span>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="password"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="sk-or-v1-..."
          className={cn(
            "flex-1 px-2.5 py-1.5 bg-background border border-border rounded-lg",
            "placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring",
            "font-mono",
            compact ? "text-xs h-7" : "text-sm h-8"
          )}
          autoFocus
        />
        <button
          onClick={handleSave}
          disabled={!inputValue.trim() || isSaving}
          className={cn(
            "px-3 bg-primary text-primary-foreground rounded-lg",
            "hover:bg-primary/90 transition-colors",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            compact ? "h-7 text-xs" : "h-8 text-sm"
          )}
        >
          {isSaving ? "Saving..." : "Save & Retry"}
        </button>
      </div>

      <p className="text-muted-foreground/70">
        <a
          href="https://openrouter.ai/keys"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline"
        >
          Get a key at openrouter.ai
        </a>
      </p>
    </div>
  );
}
