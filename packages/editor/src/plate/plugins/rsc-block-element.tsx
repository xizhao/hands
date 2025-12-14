/**
 * RSC Block Element Component
 *
 * Two-mode interaction pattern:
 * - Document Mode: Inline preview, hover to highlight, click to enter edit
 * - Editing Mode: Full OverlayEditor for editing elements inside
 *
 * Transitions:
 * - Click → Enter editing mode
 * - Escape (with no selection) → Exit to document mode
 * - Click outside → Exit to document mode
 */

import type { PlateElementProps } from "platejs/react";
import { PlateElement, useEditorRef } from "platejs/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "../../lib/utils";
import { OverlayEditor } from "../../overlay";
import { BlockSkeleton } from "../../rsc";
import type { RscBlockElement } from "./rsc-block-plugin";

// ============================================================================
// Props
// ============================================================================

interface RscBlockElementComponentProps extends PlateElementProps<RscBlockElement> {}

// ============================================================================
// Component
// ============================================================================

export function RscBlockElementComponent({
  className,
  children,
  ...props
}: RscBlockElementComponentProps) {
  const editor = useEditorRef();
  const containerRef = useRef<HTMLDivElement>(null);

  // Mode state: document (default) or editing
  const [isEditing, setIsEditing] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [initialSource, setInitialSource] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Access element from props
  const rscElement = props.element as RscBlockElement;

  // Get runtime port from editor or default
  const runtimePort = (editor as any).runtimePort || 55000;
  const workerPort = (editor as any).workerPort || 55200;

  // Fetch initial source from runtime
  useEffect(() => {
    if (!rscElement.blockId || !runtimePort) {
      setError("Missing blockId or runtimePort");
      return;
    }

    fetch(`http://localhost:${runtimePort}/workbook/blocks/${rscElement.blockId}/source`)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load block: ${res.statusText}`);
        return res.json();
      })
      .then((data) => {
        setInitialSource(data.source);
        setError(null);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
      });
  }, [rscElement.blockId, runtimePort]);

  // Enter editing mode
  const enterEditMode = useCallback(() => {
    setIsEditing(true);
    // Don't auto-focus - let user click inside to focus OverlayEditor naturally
  }, []);

  // Exit editing mode
  const exitEditMode = useCallback(() => {
    setIsEditing(false);
  }, []);

  // Handle click outside to exit editing mode
  useEffect(() => {
    if (!isEditing) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        exitEditMode();
      }
    };

    // Small delay to avoid immediate exit from the click that entered edit mode
    const timeout = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside, true);
    }, 100);

    return () => {
      clearTimeout(timeout);
      document.removeEventListener("mousedown", handleClickOutside, true);
    };
  }, [isEditing, exitEditMode]);

  // Handle Escape to exit editing mode - let OverlayEditor handle everything else
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Only handle Escape at this level - let OverlayEditor handle Delete/Backspace/etc
      if (e.key === "Escape" && isEditing) {
        e.stopPropagation();
        exitEditMode();
      }
    },
    [isEditing, exitEditMode],
  );

  // Render content based on state
  const renderContent = (interactive: boolean) => {
    if (error) {
      return (
        <div className="p-4 text-sm text-red-400 bg-red-500/10 rounded">
          <strong>Error:</strong> {error}
        </div>
      );
    }

    if (!initialSource) {
      return <BlockSkeleton />;
    }

    return (
      <OverlayEditor
        blockId={rscElement.blockId}
        initialSource={initialSource}
        runtimePort={runtimePort}
        workerPort={workerPort}
        readOnly={!interactive}
        onExit={exitEditMode}
      />
    );
  };

  // ============================================================================
  // Document Mode - Inline preview, click to edit
  // ============================================================================

  if (!isEditing) {
    return (
      <PlateElement
        className={cn("rsc-block-element group/rsc-block relative my-2", className)}
        {...props}
      >
        <div
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          {/* Drag handles provided by BlockDraggable wrapper */}

          {/* Inline content - click to edit */}
          <div
            className={cn(
              "rsc-block-preview rounded transition-all duration-150",
              isHovered && "bg-muted/30 ring-1 ring-border/50",
              "cursor-pointer",
            )}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              enterEditMode();
            }}
          >
            {/* Non-interactive preview */}
            <div className="pointer-events-none">
              {renderContent(false)}
            </div>
          </div>
        </div>

        {/* Hidden Slate children */}
        <span className="sr-only">{children}</span>
      </PlateElement>
    );
  }

  // ============================================================================
  // Editing Mode - Full interactive editor
  // ============================================================================

  return (
    <PlateElement
      className={cn("rsc-block-element group/rsc-block relative my-2", className)}
      {...props}
    >
      <div
        ref={containerRef}
        className={cn(
          "rsc-block-editing rounded",
          "ring-2 ring-blue-500/40",
          "outline-none overflow-visible",
        )}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        {/* Full interactive content */}
        <div className="overflow-visible">
          {renderContent(true)}
        </div>
      </div>

      {/* Hidden Slate children */}
      <span className="sr-only">{children}</span>
    </PlateElement>
  );
}
