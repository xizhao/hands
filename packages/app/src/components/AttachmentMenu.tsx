/**
 * AttachmentMenu Component
 *
 * Shared dropdown menu for file/folder attachments and screenshots.
 * Used by both UnifiedSidebar and FloatingChat.
 */

import { Camera, File, Folder, Paperclip, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface AttachmentMenuProps {
  /** Handler for snapshot/capture action */
  onSnapshot: () => void;
  /** Handler for file picker action */
  onPickFile: () => void;
  /** Handler for folder picker action */
  onPickFolder: () => void;
  /** List of pending file paths */
  pendingFiles?: string[];
  /** Handler to remove a pending file by index */
  onRemoveFile?: (index: number) => void;
  /** Dropdown alignment */
  align?: "start" | "center" | "end";
  /** Dropdown side */
  side?: "top" | "right" | "bottom" | "left";
  /** Side offset */
  sideOffset?: number;
  /** Custom trigger className */
  triggerClassName?: string;
  /** Icon size */
  iconSize?: "sm" | "md";
}

/**
 * Dropdown menu for attaching files, folders, or taking screenshots.
 *
 * @example
 * ```tsx
 * <AttachmentMenu
 *   onSnapshot={handleSnapshot}
 *   onPickFile={handlePickFile}
 *   onPickFolder={handlePickFolder}
 *   pendingFiles={pendingFiles}
 *   onRemoveFile={(i) => removeFile(i)}
 * />
 * ```
 */
export function AttachmentMenu({
  onSnapshot,
  onPickFile,
  onPickFolder,
  pendingFiles = [],
  onRemoveFile,
  align = "end",
  side = "top",
  sideOffset = 8,
  triggerClassName,
  iconSize = "md",
}: AttachmentMenuProps) {
  const iconClass = iconSize === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";
  const badgeSize = iconSize === "sm" ? "w-3.5 h-3.5 text-[9px]" : "w-4 h-4 text-[10px]";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={
            triggerClassName ||
            "h-8 w-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-zinc-200 transition-colors shrink-0 relative"
          }
          title="Attach file or folder"
        >
          <Paperclip className={iconClass} />
          {pendingFiles.length > 0 && (
            <span
              className={`absolute -top-1 -right-1 ${badgeSize} rounded-full bg-blue-500 text-white flex items-center justify-center`}
            >
              {pendingFiles.length}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} side={side} sideOffset={sideOffset}>
        <DropdownMenuItem onClick={onSnapshot} className="gap-2">
          <Camera className={iconClass} />
          <span>Snapshot</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onPickFile} className="gap-2">
          <File className={iconClass} />
          <span>File</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onPickFolder} className="gap-2">
          <Folder className={iconClass} />
          <span>Folder</span>
        </DropdownMenuItem>
        {pendingFiles.length > 0 && onRemoveFile && (
          <>
            <div className="border-t border-border my-1" />
            <div className="px-2 py-1 text-[10px] uppercase text-muted-foreground">
              Pending ({pendingFiles.length})
            </div>
            {pendingFiles.map((file, i) => (
              <DropdownMenuItem
                key={i}
                onClick={() => onRemoveFile(i)}
                className="gap-2 text-xs"
              >
                <X className="h-3 w-3 text-red-400" />
                <span className="truncate">{file.split("/").pop()}</span>
              </DropdownMenuItem>
            ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
