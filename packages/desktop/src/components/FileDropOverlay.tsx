/**
 * FileDropOverlay - Full-screen overlay for importing external files
 *
 * Detects when files are dragged from outside the browser and shows
 * an overlay to capture the drop. This prevents conflicts with editor DnD.
 */

import { useState, useEffect, useCallback } from "react";
import { FileArrowUp } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

interface FileDropOverlayProps {
  onFileDrop: (file: File) => void;
  accept?: string[]; // e.g. [".csv", ".json", ".parquet"]
  disabled?: boolean;
}

export function FileDropOverlay({
  onFileDrop,
  accept = [".csv", ".json", ".parquet"],
  disabled = false,
}: FileDropOverlayProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragCounter, setDragCounter] = useState(0);

  const isExternalFileDrag = useCallback((e: DragEvent): boolean => {
    // External file drags have "Files" in dataTransfer.types
    return e.dataTransfer?.types.includes("Files") ?? false;
  }, []);

  const isValidFileType = useCallback(
    (file: File): boolean => {
      if (accept.length === 0) return true;
      const ext = `.${file.name.split(".").pop()?.toLowerCase()}`;
      return accept.includes(ext);
    },
    [accept]
  );

  useEffect(() => {
    if (disabled) return;

    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault();
      if (!isExternalFileDrag(e)) return;

      setDragCounter((c) => c + 1);
      setIsDragging(true);
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      if (!isExternalFileDrag(e)) return;

      setDragCounter((c) => {
        const newCount = c - 1;
        if (newCount <= 0) {
          setIsDragging(false);
          return 0;
        }
        return newCount;
      });
    };

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      if (isExternalFileDrag(e)) {
        e.dataTransfer!.dropEffect = "copy";
      }
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      setDragCounter(0);

      if (!isExternalFileDrag(e)) return;

      const files = Array.from(e.dataTransfer?.files ?? []);
      const validFile = files.find(isValidFileType);

      if (validFile) {
        onFileDrop(validFile);
      }
    };

    window.addEventListener("dragenter", handleDragEnter);
    window.addEventListener("dragleave", handleDragLeave);
    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("drop", handleDrop);

    return () => {
      window.removeEventListener("dragenter", handleDragEnter);
      window.removeEventListener("dragleave", handleDragLeave);
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("drop", handleDrop);
    };
  }, [disabled, isExternalFileDrag, isValidFileType, onFileDrop]);

  if (!isDragging) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-[100] flex items-center justify-center",
        "bg-background/80 backdrop-blur-sm",
        "border-2 border-dashed border-primary/50",
        "transition-opacity duration-150"
      )}
    >
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="p-4 rounded-full bg-primary/10">
          <FileArrowUp weight="duotone" className="h-8 w-8 text-primary" />
        </div>
        <div>
          <div className="text-lg font-medium">Drop to import</div>
          <div className="text-sm text-muted-foreground">
            CSV, JSON, or Parquet files
          </div>
        </div>
      </div>
    </div>
  );
}
