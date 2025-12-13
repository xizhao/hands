/**
 * FileDropOverlay - Minimal full-screen overlay for file drops
 *
 * Detects when files are dragged from outside the browser and shows
 * a subtle highlight. This prevents conflicts with editor DnD.
 */

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface FileDropOverlayProps {
  onFileDrop: (file: File, dropTarget: Element | null) => void;
  disabled?: boolean;
}

export function FileDropOverlay({ onFileDrop, disabled = false }: FileDropOverlayProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [_dragCounter, setDragCounter] = useState(0);

  const isExternalFileDrag = useCallback((e: DragEvent): boolean => {
    // External file drags have "Files" in dataTransfer.types
    return e.dataTransfer?.types.includes("Files") ?? false;
  }, []);

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
      if (isExternalFileDrag(e) && e.dataTransfer) {
        e.dataTransfer.dropEffect = "copy";
      }
    };

    const handleDrop = (e: DragEvent) => {
      console.log("[FileDropOverlay] handleDrop triggered");
      e.preventDefault();
      setIsDragging(false);
      setDragCounter(0);

      if (!isExternalFileDrag(e)) {
        console.log("[FileDropOverlay] Not an external file drag, ignoring");
        return;
      }

      const files = Array.from(e.dataTransfer?.files ?? []);
      console.log(
        "[FileDropOverlay] Files dropped:",
        files.map((f) => f.name),
      );
      const file = files[0];

      // Get the element under the drop point by temporarily hiding all overlays
      const overlays = document.querySelectorAll("[data-file-drop-overlay]");
      overlays.forEach((el) => {
        (el as HTMLElement).style.pointerEvents = "none";
      });
      const dropTarget = document.elementFromPoint(e.clientX, e.clientY);
      overlays.forEach((el) => {
        (el as HTMLElement).style.pointerEvents = "";
      });
      console.log("[FileDropOverlay] Drop target (under overlay):", dropTarget);

      if (file) {
        console.log("[FileDropOverlay] File found, calling onFileDrop:", file.name);
        onFileDrop(file, dropTarget);
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
  }, [disabled, isExternalFileDrag, onFileDrop]);

  if (!isDragging) return null;

  return (
    <div
      data-file-drop-overlay
      className={cn(
        "fixed inset-0 z-[100]",
        "bg-primary/5",
        "border-2 border-primary/30",
        "transition-opacity duration-100",
      )}
    />
  );
}
