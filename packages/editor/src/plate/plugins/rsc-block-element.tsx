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
import { getTRPCClient } from "../../trpc";
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

  // Get runtime port from editor or default (blocks go through runtime proxy)
  const runtimePort = (editor as any).runtimePort || 55000;

  // Fetch initial source from runtime via tRPC
  useEffect(() => {
    if (!rscElement.blockId || !runtimePort) {
      setError("Missing blockId or runtimePort");
      return;
    }

    const trpc = getTRPCClient(runtimePort);
    trpc.workbook.blocks.getSource
      .query({ blockId: rscElement.blockId })
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

  // Handle Escape to exit editing mode
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape" && isEditing) {
        e.stopPropagation();
        e.preventDefault();
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
        readOnly={!interactive}
        onExit={exitEditMode}
      />
    );
  };

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <PlateElement
      className={cn("rsc-block-element group/rsc-block relative my-2", className)}
      {...props}
    >
      {/*
        contentEditable={false} is the Plate/Slate idiom for void elements.
        This tells the browser and Slate that this content is not editable,
        preventing cursor placement, selection, and keyboard handling.
      */}
      <div
        ref={containerRef}
        contentEditable={false}
        className={cn(
          "rsc-block-content rounded transition-all duration-150",
          !isEditing && isHovered && "bg-muted/30 ring-1 ring-border/50",
          !isEditing && "cursor-pointer",
          isEditing && "ring-2 ring-brand/40",
        )}
        onMouseEnter={() => !isEditing && setIsHovered(true)}
        onMouseLeave={() => !isEditing && setIsHovered(false)}
        onClick={(e) => {
          if (!isEditing) {
            e.preventDefault();
            e.stopPropagation();
            enterEditMode();
          }
        }}
        onKeyDown={handleKeyDown}
        tabIndex={isEditing ? 0 : undefined}
      >
        {/*
          When not editing: pointer-events-none makes content non-interactive
          When editing: full interactivity for OverlayEditor
        */}
        <div className={cn(!isEditing && "pointer-events-none")}>
          {renderContent(isEditing)}
        </div>
      </div>

      {/* Slate requires children for void elements */}
      {children}
    </PlateElement>
  );
}
