/**
 * Sidebar Icons
 *
 * Consistent icon components for sidebar items.
 */

import {
  Code,
  Database,
  Newspaper,
  Play,
  PuzzlePiece,
  Table,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

const iconStyles = "shrink-0 transition-colors";

interface IconProps {
  className?: string;
  empty?: boolean;
}

export function PageIcon({ className, empty }: IconProps) {
  return (
    <span
      className={cn(
        iconStyles,
        empty ? "opacity-50" : "group-hover:text-orange-400",
        className,
      )}
    >
      &#x25AC;
    </span>
  );
}

export function PluginIcon({ className, empty }: IconProps) {
  return (
    <PuzzlePiece
      weight="duotone"
      className={cn(
        "h-4 w-4",
        iconStyles,
        empty ? "opacity-50" : "text-violet-400",
        className,
      )}
    />
  );
}

export function ActionIcon({ className, empty }: IconProps) {
  return (
    <Play
      weight="fill"
      className={cn(
        "h-4 w-4",
        iconStyles,
        empty ? "opacity-50" : "text-green-500",
        className,
      )}
    />
  );
}

export function DataIcon({
  className,
  empty,
  colored = true,
}: IconProps & { colored?: boolean }) {
  return (
    <Table
      weight="duotone"
      className={cn(
        "h-4 w-4",
        iconStyles,
        empty
          ? "opacity-50"
          : colored
            ? "text-purple-400"
            : "text-muted-foreground group-hover:text-foreground",
        className,
      )}
    />
  );
}

export function SourceIcon({ className, empty }: IconProps) {
  return (
    <span
      className={cn(
        iconStyles,
        empty ? "opacity-50" : "group-hover:text-green-400",
        className,
      )}
    >
      &#x25B2;
    </span>
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
