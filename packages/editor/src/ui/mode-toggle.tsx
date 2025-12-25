"use client";

/**
 * Mode Toggle Tabs
 *
 * Icon-only tabs to switch between document, slides, and code view modes.
 */

import { Code, FileText, Slideshow } from "@phosphor-icons/react";
import { cn } from "../lib/utils";
import { ToolbarButton } from "./toolbar";

export type EditorMode = "visual" | "markdown" | "slides";

const MODES: { mode: EditorMode; label: string; icon: typeof Code }[] = [
  { mode: "visual", label: "Document", icon: FileText },
  { mode: "slides", label: "Slides", icon: Slideshow },
  { mode: "markdown", label: "Code", icon: Code },
];

interface ModeToggleProps {
  mode: EditorMode;
  onModeChange: (mode: EditorMode) => void;
}

export function ModeToggle({ mode, onModeChange }: ModeToggleProps) {
  return (
    <div className="flex items-center rounded-md border border-border/50 bg-muted/30 p-0.5">
      {MODES.map(({ mode: m, label, icon: Icon }) => (
        <ToolbarButton
          key={m}
          tooltip={label}
          onClick={() => onModeChange(m)}
          className={cn(
            "h-6 w-7 rounded-sm",
            mode === m
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Icon size={14} weight={mode === m ? "fill" : "regular"} />
        </ToolbarButton>
      ))}
    </div>
  );
}
