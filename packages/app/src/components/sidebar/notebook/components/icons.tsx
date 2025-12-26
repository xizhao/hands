/**
 * Sidebar Icons
 *
 * Minimalist icons for sidebar items.
 * - Docs/Pages: horizontal bars
 * - Sheets/Tables: circles
 */

import {
  ArrowSquareRight,
  Code,
  Database,
  Newspaper,
  PuzzlePiece,
  Square,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

const iconStyles = "shrink-0 transition-colors";

interface IconProps {
  className?: string;
  empty?: boolean;
}

/** Minimalist bar icon for docs/pages */
export function PageIcon({ className, empty }: IconProps) {
  return (
    <span
      className={cn(
        "inline-block w-3 h-0.5 rounded-full",
        iconStyles,
        empty ? "bg-muted-foreground/30" : "bg-blue-400/70 group-hover:bg-blue-400",
        className,
      )}
    />
  );
}

/** Minimalist circle icon for sheets/tables */
export function SheetIcon({ className, empty }: IconProps) {
  return (
    <span
      className={cn(
        "inline-block w-2 h-2 rounded-full",
        iconStyles,
        empty ? "bg-muted-foreground/30" : "bg-emerald-400/70 group-hover:bg-emerald-400",
        className,
      )}
    />
  );
}

/** Alias for backwards compatibility */
export const DataIcon = SheetIcon;

export function PluginIcon({ className, empty }: IconProps) {
  return (
    <PuzzlePiece
      weight="duotone"
      className={cn(
        "h-3.5 w-3.5",
        iconStyles,
        empty ? "opacity-30" : "text-violet-400/70 group-hover:text-violet-400",
        className,
      )}
    />
  );
}

export function ActionIcon({
  className,
  empty,
  readonly,
}: IconProps & { readonly?: boolean }) {
  const Icon = readonly ? Square : ArrowSquareRight;
  return (
    <Icon
      weight="duotone"
      className={cn(
        "h-3.5 w-3.5",
        iconStyles,
        empty
          ? "opacity-30"
          : "text-orange-400/70 group-hover:text-orange-400",
        className,
      )}
    />
  );
}

/** Triangle icon for sources */
export function SourceIcon({ className, empty }: IconProps) {
  return (
    <span
      className={cn(
        "inline-block w-0 h-0",
        "border-l-[4px] border-l-transparent",
        "border-r-[4px] border-r-transparent",
        "border-b-[6px]",
        iconStyles,
        empty ? "border-b-muted-foreground/30" : "border-b-purple-400/70 group-hover:border-b-purple-400",
        className,
      )}
    />
  );
}

// Map icon names to Phosphor icons for sources
const sourceIconMap: Record<string, React.ElementType> = {
  newspaper: Newspaper,
  code: Code,
};

export function SourceTypeIcon({
  icon,
  className,
}: {
  icon?: string;
  className?: string;
}) {
  const Icon = icon && sourceIconMap[icon] ? sourceIconMap[icon] : Database;
  return <Icon weight="duotone" className={className} />;
}
