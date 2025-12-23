"use client";

/**
 * Mode Toggle Button
 *
 * Toggles between visual editor and markdown source editing modes.
 */

import { Code, Eye } from "@phosphor-icons/react";
import { cn } from "../lib/utils";
import { ToolbarButton } from "./toolbar";

export type EditorMode = "visual" | "markdown";

interface ModeToggleProps {
  mode: EditorMode;
  onModeChange: (mode: EditorMode) => void;
}

export function ModeToggle({ mode, onModeChange }: ModeToggleProps) {
  const isMarkdown = mode === "markdown";

  const handleToggle = () => {
    onModeChange(isMarkdown ? "visual" : "markdown");
  };

  return (
    <ToolbarButton
      onClick={handleToggle}
      tooltip={isMarkdown ? "Switch to visual editor" : "Switch to markdown"}
      className={cn(
        isMarkdown && "bg-accent text-accent-foreground"
      )}
    >
      {isMarkdown ? <Eye size={16} /> : <Code size={16} />}
    </ToolbarButton>
  );
}
