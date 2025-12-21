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
// Editing Placeholder (shimmer effect for new blocks)
// ============================================================================

function EditingPlaceholder({ prompt }: { prompt?: string }) {
  return (
    <div className="relative flex items-center gap-3 overflow-hidden rounded-lg border border-primary/20 bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5 px-4 py-3">
      {/* Dramatic shimmer sweep */}
      <div className="absolute inset-0 animate-shimmer-fast bg-gradient-to-r from-transparent via-primary/30 to-transparent" />

      {/* Hands logo with glow */}
      <div className="relative flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10">
        <svg
          className="size-5 text-primary"
          viewBox="0 0 32 32"
          fill="currentColor"
        >
          <path d="M8 12h4v8H8zM14 10h4v10h-4zM20 14h4v6h-4z" />
        </svg>
      </div>

      {/* Text */}
      <span className="text-sm font-medium text-primary/80">
        Creating {prompt ? `"${prompt}"` : ""} with Hands...
      </span>
    </div>
  );
}

// ============================================================================
// Error Placeholder (for blocks that failed to load)
// ============================================================================

function ErrorPlaceholder({
  error,
  onFix,
}: {
  error: string;
  onFix?: () => void;
}) {
  return (
    <div className="relative flex items-center gap-3 overflow-hidden rounded-lg border border-red-500/30 bg-gradient-to-r from-red-500/5 via-red-500/10 to-red-500/5 px-4 py-3">
      {/* Hands logo in red */}
      <div className="relative flex size-8 shrink-0 items-center justify-center rounded-md bg-red-500/10">
        <svg
          className="size-5 text-red-500"
          viewBox="0 0 32 32"
          fill="currentColor"
        >
          <path d="M8 12h4v8H8zM14 10h4v10h-4zM20 14h4v6h-4z" />
        </svg>
      </div>

      {/* Error message */}
      <span className="flex-1 truncate text-sm text-red-400">{error}</span>

      {/* Fix button */}
      {onFix && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onFix();
          }}
          className="shrink-0 rounded-md bg-red-500/10 px-3 py-1.5 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/20 hover:text-red-300"
        >
          Fix with Hands
        </button>
      )}
    </div>
  );
}

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

  // Fetch initial source from runtime via tRPC (skip if editing new block)
  useEffect(() => {
    // Skip fetching if this is a new block being created
    if (rscElement.editing) {
      return;
    }

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
  }, [rscElement.blockId, rscElement.editing, runtimePort]);

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
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
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
    [isEditing, exitEditMode]
  );

  // Render content based on state
  const renderContent = (interactive: boolean) => {
    // New block being created - show shimmer placeholder
    if (rscElement.editing) {
      return <EditingPlaceholder prompt={rscElement.prompt} />;
    }

    if (error) {
      return (
        <ErrorPlaceholder
          error={error}
          onFix={() => {
            // TODO: Trigger AI fix flow
            console.log(
              "[RscBlock] Fix with Hands clicked for block:",
              rscElement.blockId
            );
          }}
        />
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
      className={cn(
        "rsc-block-element group/rsc-block relative my-2",
        className
      )}
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
          isEditing && "ring-2 ring-brand/40"
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
