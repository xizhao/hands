/**
 * CollapsedSidebar - Compact icon-only view
 *
 * Shows dot indicators for pages, tables, and actions.
 */

import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import type { SidebarPage, SidebarAction, SidebarTable } from "../types";

interface CollapsedSidebarProps {
  pages: SidebarPage[];
  tables: SidebarTable[];
  actions: SidebarAction[];
}

export function CollapsedSidebar({ pages, tables, actions }: CollapsedSidebarProps) {
  return (
    <TooltipProvider delayDuration={0}>
      <div className="space-y-3 px-1">
        <CollapsedSection
          items={pages}
          getKey={(p) => p.id}
          icon="&#x25AC;"
          activeColor="text-muted-foreground/70"
          label="page"
        />
        <CollapsedSection
          items={tables}
          getKey={(t) => t.name}
          icon="&#x25A0;"
          activeColor="text-emerald-400/70"
          label="table"
        />
        <CollapsedSection
          items={actions}
          getKey={(a) => a.id}
          icon="&#x25B6;"
          activeColor="text-green-500/70"
          label="action"
        />
      </div>
    </TooltipProvider>
  );
}

interface CollapsedSectionProps<T> {
  items: T[];
  getKey: (item: T) => string;
  icon: string;
  activeColor: string;
  label: string;
}

function CollapsedSection<T>({
  items,
  getKey,
  icon,
  activeColor,
  label,
}: CollapsedSectionProps<T>) {
  if (items.length === 0) {
    return (
      <div className="pt-2 border-t border-border/50">
        <div className="flex justify-center">
          <span className="text-[8px] leading-none text-muted-foreground/30">{icon}</span>
        </div>
      </div>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex flex-wrap gap-0.5 justify-center pt-2 border-t border-border/50 cursor-default">
          {items.map((item) => (
            <span key={getKey(item)} className={`text-[8px] leading-none ${activeColor}`}>
              {icon}
            </span>
          ))}
        </div>
      </TooltipTrigger>
      <TooltipContent side="right">
        <p>
          {items.length} {label}
          {items.length !== 1 ? "s" : ""}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
