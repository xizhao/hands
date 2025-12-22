/**
 * SidebarSection - Collapsible section with header
 *
 * Reusable component for section headers with expand/collapse.
 */

import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface SidebarSectionProps {
  /** Section title */
  title: string;
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
}

export function SidebarSection({
  title,
  expanded,
  onToggle,
  onAdd,
  addTooltip,
  children,
  className,
}: SidebarSectionProps) {
  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex items-center justify-between">
        <button
          onClick={onToggle}
          className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground/80 uppercase tracking-wider hover:text-muted-foreground transition-colors"
        >
          {expanded ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
          {title}
        </button>
        {onAdd && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onAdd}
                className="p-0.5 text-muted-foreground/60 hover:text-muted-foreground transition-colors"
              >
                <Plus className="h-3 w-3" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">{addTooltip || `New ${title.toLowerCase()}`}</TooltipContent>
          </Tooltip>
        )}
      </div>

      {expanded && <div className="space-y-0">{children}</div>}
    </div>
  );
}

/** Empty state for sections with no items */
interface EmptyStateProps {
  icon: React.ReactNode;
  label: string;
}

export function SidebarEmptyState({ icon, label }: EmptyStateProps) {
  return (
    <div className="flex items-center gap-2 px-2 py-1 text-sm text-muted-foreground/60">
      {icon}
      <span>{label}</span>
    </div>
  );
}
