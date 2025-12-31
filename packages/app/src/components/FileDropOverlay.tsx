/**
 * FileDropOverlay - Full-screen overlay for importing external files
 *
 * Uses Tauri's native drag events (requires dragDropEnabled: true in tauri.conf.json).
 */

import { FileArrowUp } from "@phosphor-icons/react";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface FileDropOverlayProps {
  /** Called with the file path when a file is dropped */
  onFileDrop: (filePath: string) => void;
  disabled?: boolean;
}

interface TauriDragPayload {
  paths: string[];
  position: { x: number; y: number };
}

export function FileDropOverlay({ onFileDrop, disabled = false }: FileDropOverlayProps) {
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (disabled) return;

    // Tauri drag events for UI state
    // Only show overlay for external file drags (paths array will have entries)
    const unlistenEnter = listen<TauriDragPayload>("tauri://drag-enter", (event) => {
      // Only show overlay if dragging actual files from outside the app
      if (event.payload.paths && event.payload.paths.length > 0) {
        setIsDragging(true);
      }
    });

    const unlistenLeave = listen("tauri://drag-leave", () => {
      setIsDragging(false);
    });

    // Tauri drop event gives us the actual file path
    const unlistenDrop = listen<TauriDragPayload>("tauri://drag-drop", (event) => {
      setIsDragging(false);

      const paths = event.payload.paths;
      if (paths && paths.length > 0) {
        onFileDrop(paths[0]);
      }
    });

    return () => {
      unlistenEnter.then((fn) => fn());
      unlistenLeave.then((fn) => fn());
      unlistenDrop.then((fn) => fn());
    };
  }, [disabled, onFileDrop]);

  if (!isDragging) return null;

  return (
    <div
      data-file-drop-overlay
      className={cn(
        "fixed inset-0 z-[100]",
        "flex flex-col items-center justify-center gap-3",
        "bg-background/80 backdrop-blur-sm",
        "border-2 border-dashed border-primary/40",
        "transition-opacity duration-150",
      )}
    >
      <FileArrowUp weight="duotone" className="h-12 w-12 text-primary/60" />
      <div className="text-sm text-muted-foreground">Drop file to import</div>
    </div>
  );
}
