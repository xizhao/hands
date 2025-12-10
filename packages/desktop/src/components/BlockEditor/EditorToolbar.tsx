/**
 * EditorToolbar - Block editor toolbar
 */

import { Link } from "@tanstack/react-router";
import { ArrowLeft, FloppyDisk, Code } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

interface EditorToolbarProps {
  blockId: string;
  onSave: () => void;
  isSaving: boolean;
}

export function EditorToolbar({ blockId, onSave, isSaving }: EditorToolbarProps) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b bg-background">
      {/* Back button */}
      <Link
        to="/blocks"
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft weight="bold" className="h-4 w-4" />
        Blocks
      </Link>

      {/* Block name */}
      <div className="flex-1 flex items-center gap-2">
        <span className="text-sm font-medium">{blockId}</span>
        <span className="text-xs text-muted-foreground">.tsx</span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        {/* View Code */}
        <Link
          to="/blocks/$blockId"
          params={{ blockId }}
          search={{ view: "code" }}
          className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-md hover:bg-accent transition-colors"
        >
          <Code weight="duotone" className="h-4 w-4" />
          Code
        </Link>

        {/* Save */}
        <button
          onClick={onSave}
          disabled={isSaving}
          className={cn(
            "flex items-center gap-1 px-3 py-1.5 text-sm rounded-md",
            "bg-primary text-primary-foreground hover:bg-primary/90",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            "transition-colors"
          )}
        >
          <FloppyDisk weight="duotone" className="h-4 w-4" />
          {isSaving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}
