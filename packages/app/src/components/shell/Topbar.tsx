/**
 * Topbar - Global navigation bar
 *
 * Shared between web and desktop.
 * Shows logo, workbook name, and navigation controls.
 */

import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface TopbarProps {
  /** Logo/brand element */
  logo?: ReactNode;
  /** Center content (e.g., workbook name, tabs) */
  center?: ReactNode;
  /** Right side actions */
  actions?: ReactNode;
  /** Additional class name */
  className?: string;
}

export function Topbar({ logo, center, actions, className }: TopbarProps) {
  return (
    <div
      className={cn(
        "h-10 shrink-0 flex items-center gap-3 px-3 bg-surface",
        className
      )}
    >
      {/* Left: Logo */}
      <div className="flex items-center gap-2">
        {logo}
      </div>

      {/* Center: flexible content */}
      <div className="flex-1 flex items-center justify-center min-w-0">
        {center}
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-2">{actions}</div>
    </div>
  );
}
