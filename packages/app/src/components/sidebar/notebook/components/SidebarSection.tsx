/**
 * SidebarSection - Arc-style collapsible section with pill header
 *
 * Generous clickable pill headers that expand/collapse content.
 */

import { Plus } from "lucide-react";
import { FileText, Table, Lightning, PuzzlePiece } from "@phosphor-icons/react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** Section type determines the icon */
type SectionType = "docs" | "sheets" | "actions" | "plugins";

/** Section size variant */
type SectionSize = "default" | "lg";

const sectionIcons: Record<SectionType, React.ElementType> = {
  docs: FileText,
  sheets: Table,
  actions: Lightning,
  plugins: PuzzlePiece,
};

const sectionColors: Record<SectionType, string> = {
  docs: "text-blue-400",
  sheets: "text-emerald-400",
  actions: "text-orange-400",
  plugins: "text-violet-400",
};

interface SidebarSectionProps {
  /** Section title */
  title: string;
  /** Section type for icon */
  type?: SectionType;
  /** Item count */
  count?: number;
  /** Whether section is expanded */
  expanded: boolean;
  /** Toggle expand/collapse */
  onToggle: () => void;
  /** Optional add button handler */
  onAdd?: () => void;
  /** Tooltip for add button */
  addTooltip?: string;
  /** Section content */
  children: React.ReactNode;
  /** Additional class names */
  className?: string;
  /** Size variant */
  size?: SectionSize;
}

export function SidebarSection({
  title,
  type = "docs",
  count,
  expanded,
  onToggle,
  onAdd,
  addTooltip,
  children,
  className,
  size = "default",
}: SidebarSectionProps) {
  const Icon = sectionIcons[type];
  const iconColor = sectionColors[type];
  const isLarge = size === "lg";

  return (
    <div className={cn("space-y-1", className)}>
      {/* Arc-style section header */}
      <div className="flex items-center gap-1">
        <button
          onClick={onToggle}
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-xl font-medium transition-all duration-200",
            isLarge ? "text-sm" : "text-[13px]",
            expanded
              ? "bg-accent text-foreground"
              : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
          )}
        >
          <Icon weight="duotone" className={cn("h-4 w-4", iconColor)} />
          <span>{title}</span>
          {count !== undefined && count > 0 && (
            <span className="text-xs text-muted-foreground/60 tabular-nums">
              {count}
            </span>
          )}
        </button>

        {onAdd && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onAdd();
                }}
                className={cn(
                  "p-1 rounded-full",
                  "text-muted-foreground/40 hover:text-muted-foreground hover:bg-accent/50",
                  "transition-colors"
                )}
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">
              {addTooltip || `New ${title.toLowerCase()}`}
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* Content */}
      {expanded && (
        <div className="pl-1 space-y-0.5">
          {children}
        </div>
      )}
    </div>
  );
}

/** Empty state for sections with no items */
interface EmptyStateProps {
  icon?: React.ReactNode;
  label: string;
}

export function SidebarEmptyState({ label }: EmptyStateProps) {
  return (
    <div className="px-3 py-2 text-xs text-muted-foreground/50">
      {label}
    </div>
  );
}
