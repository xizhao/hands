/**
 * SidebarItem - Reusable list item for sidebar
 *
 * Shared styles and structure for all sidebar list items.
 */

import { cn } from "@/lib/utils";

/** Shared list item styles - minimalist */
export const listItemStyles =
  "w-full flex items-center gap-2.5 px-2 py-1 text-xs text-muted-foreground hover:text-foreground rounded transition-colors group";

interface SidebarItemProps {
  /** Icon element */
  icon: React.ReactNode;
  /** Item label */
  label: string;
  /** Click handler */
  onClick: () => void;
  /** Right-side content (actions, badges, etc.) */
  trailing?: React.ReactNode;
  /** Additional class names */
  className?: string;
}

export function SidebarItem({ icon, label, onClick, trailing, className }: SidebarItemProps) {
  return (
    <div className={cn(listItemStyles, className)}>
      {icon}
      <button onClick={onClick} className="flex-1 truncate text-left hover:underline">
        {label}
      </button>
      {trailing}
    </div>
  );
}

/** Folder item with expand/collapse */
interface SidebarFolderProps {
  /** Folder icon (expanded/collapsed) */
  icon: React.ReactNode;
  /** Expand chevron */
  chevron: React.ReactNode;
  /** Folder name */
  label: string;
  /** Number of items in folder */
  count?: number;
  /** Toggle expand/collapse */
  onToggle: () => void;
  /** Folder contents when expanded */
  children?: React.ReactNode;
  /** Additional class names */
  className?: string;
}

export function SidebarFolder({
  icon,
  chevron,
  label,
  count,
  onToggle,
  children,
  className,
}: SidebarFolderProps) {
  return (
    <div className={className}>
      <div className={cn(listItemStyles, "group")}>
        <button onClick={onToggle} className="shrink-0">
          {chevron}
        </button>
        {icon}
        <button onClick={onToggle} className="flex-1 truncate text-left hover:underline">
          {label}
        </button>
        {count !== undefined && (
          <span className="text-xs text-muted-foreground/60">{count}</span>
        )}
      </div>

      {children && (
        <div className="ml-4 border-l border-border/50 pl-1">{children}</div>
      )}
    </div>
  );
}

/** Nested items container */
interface NestedItemsProps {
  children: React.ReactNode;
  className?: string;
}

export function NestedItems({ children, className }: NestedItemsProps) {
  return (
    <div className={cn("ml-4 border-l border-border/50 pl-1", className)}>{children}</div>
  );
}
