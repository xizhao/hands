"use client";

/**
 * SpecBar - Page spec/description input
 *
 * Compact input with sync button, designed to appear in a dropdown
 * attached to the page tab in the header.
 */

import { RefreshCw } from "lucide-react";
import { cn } from "../lib/utils";

export interface SpecBarProps {
  /** Current description/spec text */
  description: string;
  /** Callback when description changes */
  onDescriptionChange: (description: string) => void;
  /** Callback to sync (regenerate content from spec + schema) */
  onSync?: () => void;
  /** Whether sync operation is in progress */
  isSyncing?: boolean;
  /** Whether the editor is read-only */
  readOnly?: boolean;
  /** Additional class names */
  className?: string;
}

export function SpecBar({
  description,
  onDescriptionChange,
  onSync,
  isSyncing = false,
  readOnly = false,
  className,
}: SpecBarProps) {
  return (
    <div className={cn("p-3 w-[400px]", className)}>
      <div className="flex flex-col gap-2">
        {/* Description textarea - auto-height based on content */}
        <textarea
          value={description}
          onChange={(e) => {
            onDescriptionChange(e.target.value);
            // Auto-resize height
            e.target.style.height = "auto";
            e.target.style.height = `${e.target.scrollHeight}px`;
          }}
          placeholder="Describe what this page should show..."
          readOnly={readOnly}
          rows={1}
          className={cn(
            "w-full bg-transparent text-sm outline-none resize-none min-h-[1.5em]",
            "placeholder:text-muted-foreground/50",
            "text-foreground"
          )}
          style={{ height: "auto", overflow: "hidden" }}
        />

        {/* Sync button row */}
        <div className="flex items-center justify-end">
          <button
            onClick={onSync}
            disabled={readOnly || isSyncing || !onSync}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium",
              "bg-primary/10 text-primary hover:bg-primary/20",
              "disabled:opacity-30 disabled:cursor-not-allowed",
              "transition-colors"
            )}
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5", isSyncing && "animate-spin")}
            />
            {isSyncing ? "Syncing..." : "Sync"}
          </button>
        </div>
      </div>
    </div>
  );
}
