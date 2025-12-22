/**
 * ItemActions - Dropdown menu for item operations
 *
 * Reusable dropdown for copy, delete, and convert operations.
 */

import { ArrowSquareOut, Copy, Trash } from "@phosphor-icons/react";
import { MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ItemActionsProps {
  onCopy?: () => void;
  onDelete?: () => void;
  onConvertToSource?: () => void;
  copyLabel?: string;
  deleteLabel?: string;
  onOpenChange?: (open: boolean) => void;
}

export function ItemActions({
  onCopy,
  onDelete,
  onConvertToSource,
  copyLabel = "Duplicate",
  deleteLabel = "Delete",
  onOpenChange,
}: ItemActionsProps) {
  return (
    <DropdownMenu onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          onClick={(e) => e.stopPropagation()}
          className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-accent transition-all"
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        {onConvertToSource && (
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              onConvertToSource();
            }}
          >
            <ArrowSquareOut weight="duotone" className="h-3.5 w-3.5 mr-2" />
            Convert to Source
          </DropdownMenuItem>
        )}
        {onConvertToSource && (onCopy || onDelete) && <DropdownMenuSeparator />}
        {onCopy && (
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              onCopy();
            }}
          >
            <Copy weight="duotone" className="h-3.5 w-3.5 mr-2" />
            {copyLabel}
          </DropdownMenuItem>
        )}
        {onCopy && onDelete && <DropdownMenuSeparator />}
        {onDelete && (
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="text-destructive focus:text-destructive"
          >
            <Trash weight="duotone" className="h-3.5 w-3.5 mr-2" />
            {deleteLabel}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
