/**
 * FileDropOverlay - Full-screen overlay for importing external files
 *
 * Uses Tauri's native drag events on desktop (requires dragDropEnabled: true in tauri.conf.json).
 * In web mode, uses HTML5 drag-drop events.
 */

import { FileArrowUp } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { usePlatform } from "@/platform";
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
  const platform = usePlatform();

  // Desktop: Use Tauri native drag events
  useEffect(() => {
    if (disabled || platform.platform !== "desktop") return;

    // Dynamic import to avoid bundling Tauri APIs in web build
    let cleanup: (() => void) | null = null;

    import("@tauri-apps/api/event").then(({ listen }) => {
      const unlistenEnter = listen<TauriDragPayload>("tauri://drag-enter", (event) => {
        if (event.payload.paths && event.payload.paths.length > 0) {
          setIsDragging(true);
        }
      });

      const unlistenLeave = listen("tauri://drag-leave", () => {
        setIsDragging(false);
      });

      const unlistenDrop = listen<TauriDragPayload>("tauri://drag-drop", (event) => {
        setIsDragging(false);
        const paths = event.payload.paths;
        if (paths && paths.length > 0) {
          onFileDrop(paths[0]);
        }
      });

      cleanup = () => {
        unlistenEnter.then((fn) => fn());
        unlistenLeave.then((fn) => fn());
        unlistenDrop.then((fn) => fn());
      };
    }).catch((err) => {
      console.warn("[FileDropOverlay] Tauri events not available:", err);
    });

    return () => {
      cleanup?.();
    };
  }, [disabled, onFileDrop, platform.platform]);

  // Web: Use HTML5 drag-drop events (file name only, no path)
  useEffect(() => {
    if (disabled || platform.platform !== "web") return;

    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer?.types.includes("Files")) {
        setIsDragging(true);
      }
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      // Only hide if leaving the window (not entering a child element)
      if (e.relatedTarget === null) {
        setIsDragging(false);
      }
    };

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        // In web mode, we can only get the file name, not the full path
        // Pass the File object as a special "web:" prefixed path
        onFileDrop(`web:${files[0].name}`);
      }
    };

    document.addEventListener("dragenter", handleDragEnter);
    document.addEventListener("dragleave", handleDragLeave);
    document.addEventListener("dragover", handleDragOver);
    document.addEventListener("drop", handleDrop);

    return () => {
      document.removeEventListener("dragenter", handleDragEnter);
      document.removeEventListener("dragleave", handleDragLeave);
      document.removeEventListener("dragover", handleDragOver);
      document.removeEventListener("drop", handleDrop);
    };
  }, [disabled, onFileDrop, platform.platform]);

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
