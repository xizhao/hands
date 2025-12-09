/**
 * DataChip - Clickable chip that opens floating data panels
 *
 * These chips represent Sources, Data, and Insights panels
 * that can be detached and opened as floating windows.
 */

import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface DataChipProps {
  icon: React.ReactNode;
  label: string;
  collapsed?: boolean;
  active?: boolean;
  onClick: () => void;
}

export function DataChip({
  icon,
  label,
  collapsed = false,
  active = false,
  onClick,
}: DataChipProps) {
  if (collapsed) {
    return (
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onClick}
              className={cn(
                "w-full flex items-center justify-center p-2 rounded-lg transition-all",
                active
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              )}
            >
              {icon}
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">
            <p>{label}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm font-medium transition-all",
        active
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:text-foreground hover:bg-accent"
      )}
    >
      <span className="shrink-0">{icon}</span>
      <span>{label}</span>
      {active && (
        <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />
      )}
    </button>
  );
}
