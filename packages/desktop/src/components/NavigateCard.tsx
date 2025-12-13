/**
 * NavigateLink - Minimal link shown after navigate tool completes
 *
 * Navigation itself is handled by SSE event handler.
 * This just shows a clickable link in the chat for reference.
 */

import { useNavigate } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { memo } from "react";
import { cn } from "@/lib/utils";

export interface NavigateOutput {
  type: "navigate";
  blockId: string;
  title?: string;
  description?: string;
  anchor?: string;
  autoNavigate?: boolean;
}

/**
 * Parse navigate tool output
 */
export function parseNavigateOutput(output: string): NavigateOutput | null {
  try {
    const parsed = JSON.parse(output);
    if (parsed?.type === "navigate" && parsed.blockId) {
      return parsed as NavigateOutput;
    }
  } catch {
    // Not JSON or not a navigate output
  }
  return null;
}

interface NavigateCardProps {
  output: NavigateOutput;
  toolId?: string;
}

export const NavigateCard = memo(({ output }: NavigateCardProps) => {
  const navigate = useNavigate();

  const handleClick = () => {
    const blockId = output.blockId.replace(/^\//, "");
    navigate({ to: "/blocks/$blockId", params: { blockId } });
  };

  // Minimal inline link
  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        "inline-flex items-center gap-1 text-xs",
        "text-blue-400 hover:text-blue-300",
        "hover:underline transition-colors",
      )}
    >
      <span>{output.title || output.blockId}</span>
      <ArrowRight className="h-3 w-3" />
    </button>
  );
});

NavigateCard.displayName = "NavigateCard";
