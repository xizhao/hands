/**
 * WorkbookDropdown Component
 *
 * Shared dropdown menu for switching between workbooks.
 * Used by both UnifiedSidebar and FloatingChat.
 */

import { Check, ChevronDown, Plus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Workbook } from "@/hooks/useWorkbook";

export interface WorkbookDropdownProps {
  /** List of available workbooks */
  workbooks: Workbook[];
  /** Currently selected workbook (by ID or directory) */
  currentWorkbook?: Workbook | null;
  /** Current workbook directory for matching */
  currentWorkbookDir?: string;
  /** Handler for switching workbook */
  onSwitchWorkbook: (workbook: Workbook) => void;
  /** Handler for creating new workbook */
  onCreateWorkbook: () => void;
  /** Dropdown alignment */
  align?: "start" | "center" | "end";
  /** Dropdown side */
  side?: "top" | "right" | "bottom" | "left";
  /** Side offset */
  sideOffset?: number;
  /** Dropdown width */
  width?: string;
  /** Custom trigger - if provided, replaces default trigger */
  trigger?: React.ReactNode;
  /** Custom trigger className */
  triggerClassName?: string;
  /** Show chevron indicator */
  showChevron?: boolean;
}

/**
 * Dropdown menu for switching between workbooks.
 *
 * @example
 * ```tsx
 * <WorkbookDropdown
 *   workbooks={workbooks}
 *   currentWorkbook={currentWorkbook}
 *   onSwitchWorkbook={handleSwitch}
 *   onCreateWorkbook={handleCreate}
 * />
 * ```
 */
export function WorkbookDropdown({
  workbooks,
  currentWorkbook,
  currentWorkbookDir,
  onSwitchWorkbook,
  onCreateWorkbook,
  align = "start",
  side = "top",
  sideOffset = 4,
  width = "w-[200px]",
  trigger,
  triggerClassName,
  showChevron = true,
}: WorkbookDropdownProps) {
  // Match by directory if provided, otherwise by id
  const isCurrentWorkbook = (wb: Workbook) => {
    if (currentWorkbookDir) {
      return wb.directory === currentWorkbookDir;
    }
    return currentWorkbook?.id === wb.id;
  };

  const workbookName = currentWorkbook?.name || "No workbook";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {trigger || (
          <button
            className={
              triggerClassName ||
              "flex items-center gap-1 truncate hover:text-zinc-200 transition-colors"
            }
          >
            <span className="truncate">{workbookName}</span>
            {showChevron && <ChevronDown className="h-3 w-3 shrink-0" />}
          </button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} side={side} sideOffset={sideOffset} className={width}>
        {workbooks.map((wb) => (
          <DropdownMenuItem
            key={wb.id}
            onClick={() => onSwitchWorkbook(wb)}
            className="flex items-center justify-between"
          >
            <span className="truncate text-[13px]">{wb.name}</span>
            {isCurrentWorkbook(wb) && (
              <Check className="h-3.5 w-3.5 text-primary shrink-0" />
            )}
          </DropdownMenuItem>
        ))}
        {workbooks.length > 0 && <div className="border-t border-border my-1" />}
        <DropdownMenuItem onClick={onCreateWorkbook} className="gap-2">
          <Plus className="h-3.5 w-3.5" />
          <span className="text-[13px]">New Notebook</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
