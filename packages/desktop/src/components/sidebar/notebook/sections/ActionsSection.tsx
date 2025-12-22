/**
 * ActionsSection - Actions section in sidebar
 *
 * Displays runnable actions with schedule/trigger indicators.
 */

import { CircleNotch, Clock, Globe, Play } from "@phosphor-icons/react";
import { useState, useCallback } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { SidebarSection, SidebarEmptyState } from "../components/SidebarSection";
import { listItemStyles } from "../components/SidebarItem";
import { ActionIcon } from "../components/icons";
import type { SidebarAction } from "../types";
import type { SidebarActions } from "../hooks/useSidebarActions";

interface ActionsSectionProps {
  /** Section expanded state */
  expanded: boolean;
  /** Toggle section */
  onToggle: () => void;
  /** Actions list */
  actions: SidebarAction[];
  /** Actions handlers */
  handlers: SidebarActions;
}

export function ActionsSection({
  expanded,
  onToggle,
  actions,
  handlers,
}: ActionsSectionProps) {
  const { handleActionClick, handleRunAction, runtimePort } = handlers;

  return (
    <SidebarSection
      title="Actions"
      expanded={expanded}
      onToggle={onToggle}
      onAdd={() => {
        // TODO: Create new action
        console.log("[sidebar] new action clicked");
      }}
      addTooltip="New action"
    >
      {actions.length > 0 ? (
        actions.map((action) => (
          <ActionListItem
            key={action.id}
            action={action}
            onSelect={() => handleActionClick(action.id)}
            onRun={() => handleRunAction(action.id)}
            runtimePort={runtimePort}
          />
        ))
      ) : (
        <SidebarEmptyState icon={<ActionIcon empty />} label="No actions" />
      )}
    </SidebarSection>
  );
}

/** Action list item with run button and indicators */
interface ActionListItemProps {
  action: SidebarAction;
  onSelect: () => void;
  onRun: () => Promise<boolean>;
  runtimePort: number | null;
}

function ActionListItem({ action, onSelect, onRun, runtimePort }: ActionListItemProps) {
  const [isRunning, setIsRunning] = useState(false);

  const handleRun = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!runtimePort || isRunning) return;

      setIsRunning(true);
      try {
        await onRun();
      } finally {
        setIsRunning(false);
      }
    },
    [runtimePort, isRunning, onRun],
  );

  return (
    <div className={listItemStyles}>
      <ActionIcon />
      <button onClick={onSelect} className="flex-1 truncate text-left hover:underline">
        {action.name}
      </button>

      {/* Trigger indicators */}
      <div className="flex items-center gap-0.5">
        {action.schedule && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-muted-foreground/60">
                <Clock weight="duotone" className="h-3 w-3" />
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">Schedule: {action.schedule}</TooltipContent>
          </Tooltip>
        )}
        {action.triggers.includes("webhook") && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-muted-foreground/60">
                <Globe weight="duotone" className="h-3 w-3" />
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">Webhook trigger</TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* Run button */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={handleRun}
            disabled={isRunning || !runtimePort}
            className={cn(
              "p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-accent transition-all",
              (isRunning || !runtimePort) && "opacity-50 cursor-not-allowed",
            )}
          >
            {isRunning ? (
              <CircleNotch weight="bold" className="h-3.5 w-3.5 animate-spin text-green-500" />
            ) : (
              <Play weight="fill" className="h-3.5 w-3.5 text-green-500" />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">Run now</TooltipContent>
      </Tooltip>
    </div>
  );
}
