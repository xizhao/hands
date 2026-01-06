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
import {
  type RouteType,
  ROUTE_PREFIXES,
  normalizeRouteId,
} from "@/types/routes";

export interface NavigateOutput {
  type: "navigate";
  routeType: RouteType;
  id: string;
  title?: string;
  description?: string;
  autoNavigate?: boolean;
  refresh?: boolean;
}

/**
 * Parse navigate tool output
 */
export function parseNavigateOutput(output: string): NavigateOutput | null {
  try {
    const parsed = JSON.parse(output);
    if (parsed?.type === "navigate" && parsed.routeType && parsed.id) {
      return parsed as NavigateOutput;
    }
  } catch {
    // Not JSON or not a navigate output
  }
  return null;
}

/**
 * Build route path from navigate output
 */
export function buildRoutePath(output: NavigateOutput): string {
  const prefix = ROUTE_PREFIXES[output.routeType] || "/pages";
  const id = normalizeRouteId(output.routeType, output.id);
  return `${prefix}/${id}`;
}

interface NavigateCardProps {
  output: NavigateOutput;
  toolId?: string;
}

export const NavigateCard = memo(({ output }: NavigateCardProps) => {
  const navigate = useNavigate();

  const handleClick = () => {
    navigate({ to: buildRoutePath(output) });
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
      <span>{output.title || output.id}</span>
      <ArrowRight className="h-3 w-3" />
    </button>
  );
});

NavigateCard.displayName = "NavigateCard";
