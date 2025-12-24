import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useRef, useState } from "react";

interface SelectionRect {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export function CaptureOverlay() {
  const [isSelecting, setIsSelecting] = useState(false);
  const [selection, setSelection] = useState<SelectionRect | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const overlayRef = useRef<HTMLDivElement>(null);

  // Handle escape key to cancel
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        try {
          await invoke("cancel_capture");
        } catch (err) {
          console.error("Failed to cancel capture:", err);
          // Fallback: close window directly
          const win = getCurrentWindow();
          await win.close();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsSelecting(true);
    setSelection({
      startX: e.clientX,
      startY: e.clientY,
      endX: e.clientX,
      endY: e.clientY,
    });
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      setMousePos({ x: e.clientX, y: e.clientY });

      if (isSelecting && selection) {
        setSelection((prev) =>
          prev
            ? {
                ...prev,
                endX: e.clientX,
                endY: e.clientY,
              }
            : null
        );
      }
    },
    [isSelecting, selection]
  );

  const handleMouseUp = useCallback(async () => {
    if (!isSelecting || !selection) return;

    setIsSelecting(false);

    // Calculate normalized rect (handle dragging in any direction)
    const x = Math.min(selection.startX, selection.endX);
    const y = Math.min(selection.startY, selection.endY);
    const width = Math.abs(selection.endX - selection.startX);
    const height = Math.abs(selection.endY - selection.startY);

    // Minimum selection size
    if (width < 10 || height < 10) {
      setSelection(null);
      return;
    }

    try {
      // Call Tauri to capture the region
      await invoke("capture_region", {
        x: Math.round(x),
        y: Math.round(y),
        width: Math.round(width),
        height: Math.round(height),
      });
    } catch (err) {
      console.error("Failed to capture region:", err);
      // Close overlay on error
      const win = getCurrentWindow();
      await win.close();
    }
  }, [isSelecting, selection]);

  // Get selection rectangle coordinates
  const getSelectionRect = () => {
    if (!selection) return null;

    const x = Math.min(selection.startX, selection.endX);
    const y = Math.min(selection.startY, selection.endY);
    const width = Math.abs(selection.endX - selection.startX);
    const height = Math.abs(selection.endY - selection.startY);

    return { x, y, width, height };
  };

  const rect = getSelectionRect();

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 cursor-crosshair select-none"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      style={{
        backgroundColor: "rgba(0, 0, 0, 0.3)",
      }}
    >
      {/* Crosshair lines */}
      {!isSelecting && (
        <>
          <div
            className="absolute w-px bg-white/50"
            style={{
              left: mousePos.x,
              top: 0,
              bottom: 0,
            }}
          />
          <div
            className="absolute h-px bg-white/50"
            style={{
              top: mousePos.y,
              left: 0,
              right: 0,
            }}
          />
        </>
      )}

      {/* Selection rectangle */}
      {rect && (
        <>
          {/* Clear area in the selection */}
          <div
            className="absolute border-2 border-blue-500"
            style={{
              left: rect.x,
              top: rect.y,
              width: rect.width,
              height: rect.height,
              backgroundColor: "transparent",
              boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.3)",
            }}
          />

          {/* Size indicator */}
          <div
            className="absolute px-2 py-1 bg-black/80 text-white text-xs rounded font-mono"
            style={{
              left: rect.x,
              top: rect.y + rect.height + 8,
            }}
          >
            {Math.round(rect.width)} × {Math.round(rect.height)}
          </div>
        </>
      )}

      {/* Instructions */}
      <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 bg-black/80 text-white px-4 py-2 rounded-lg text-sm">
        Drag to select a region • Press <kbd className="px-1.5 py-0.5 bg-white/20 rounded">Esc</kbd> to cancel
      </div>
    </div>
  );
}

export default CaptureOverlay;
