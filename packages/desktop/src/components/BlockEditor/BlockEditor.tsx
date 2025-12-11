/**
 * BlockEditor - Block Editor with Live Preview
 *
 * Renders the actual block (via RSC Flight) with a Plate-style floating toolbar.
 * - Hover to see toolbar
 * - Click code icon to edit source
 * - Auto-saves on change (debounced)
 * - Hot reloads when source changes externally
 */

import { useState, useCallback, useEffect, useRef, Suspense } from "react";
import { useBlock, useBlockSource } from "@/lib/blocks-client";
import { cn } from "@/lib/utils";
import { RefreshCw, Check, Save, FileCode } from "lucide-react";
import { RscErrorBoundary } from "@/components/ui/rsc-error-boundary";

export interface BlockEditorProps {
  blockId: string;
  className?: string;
  onSave?: () => void;
}

export function BlockEditor({ blockId, className, onSave }: BlockEditorProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [showSource, setShowSource] = useState(false);

  // Fetch the rendered block
  const {
    data: blockData,
    isLoading,
    invalidate,
    isRefetching,
    runtimeReady,
    isWaitingForRuntime,
  } = useBlock(blockId);

  // Fetch block source for editing
  const {
    data: sourceData,
    source: currentSource,
    save: saveSource,
    isLoading: sourceLoading,
  } = useBlockSource(blockId);

  const [editedSource, setEditedSource] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Sync editedSource with loaded source when opening editor
  useEffect(() => {
    if (showSource && editedSource === null && currentSource) {
      setEditedSource(currentSource);
    }
  }, [showSource, editedSource, currentSource]);

  // Auto-save with debounce when source changes
  useEffect(() => {
    if (editedSource === null || editedSource === currentSource) {
      setHasUnsavedChanges(false);
      return;
    }

    setHasUnsavedChanges(true);

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Debounce save (1 second)
    saveTimeoutRef.current = setTimeout(async () => {
      setIsSaving(true);
      try {
        const result = await saveSource(editedSource);
        if (result.success) {
          setHasUnsavedChanges(false);
          onSave?.();
        }
      } finally {
        setIsSaving(false);
      }
    }, 1000);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [editedSource, currentSource, saveSource, onSave]);

  const handleRefresh = useCallback(() => {
    invalidate();
  }, [invalidate]);

  const handleToggleSource = useCallback(() => {
    if (showSource) {
      // Closing - clear edited source
      setShowSource(false);
      setEditedSource(null);
    } else {
      // Opening - load current source
      setEditedSource(currentSource || "");
      setShowSource(true);
    }
  }, [showSource, currentSource]);

  const handleSaveNow = useCallback(async () => {
    if (editedSource === null || !hasUnsavedChanges) return;

    // Clear pending auto-save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    setIsSaving(true);
    try {
      const result = await saveSource(editedSource);
      if (result.success) {
        setHasUnsavedChanges(false);
        onSave?.();
      }
    } finally {
      setIsSaving(false);
    }
  }, [editedSource, hasUnsavedChanges, saveSource, onSave]);

  const loading = isLoading || isRefetching;

  return (
    <div
      className={cn("relative h-full", className)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Plate-style floating toolbar - appears on hover */}
      <div
        className={cn(
          "absolute top-3 left-1/2 -translate-x-1/2 z-10",
          "flex items-center gap-0.5 px-1 py-0.5 rounded-lg",
          "bg-popover border shadow-md",
          "transition-all duration-150",
          isHovered || showSource
            ? "opacity-100 translate-y-0"
            : "opacity-0 -translate-y-2 pointer-events-none"
        )}
      >
        {/* Refresh */}
        <button
          onClick={handleRefresh}
          disabled={loading}
          className={cn(
            "p-1.5 rounded-md transition-colors",
            "hover:bg-accent text-muted-foreground hover:text-foreground"
          )}
          title="Refresh preview"
        >
          <RefreshCw
            className={cn("h-4 w-4", loading && "animate-spin")}
          />
        </button>

        {/* Separator */}
        <div className="w-px h-4 bg-border mx-0.5" />

        {/* Toggle source editor */}
        <button
          onClick={handleToggleSource}
          className={cn(
            "p-1.5 rounded-md transition-colors",
            "hover:bg-accent",
            showSource
              ? "bg-accent text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
          title={showSource ? "Hide source" : "Edit source"}
        >
          <FileCode className="h-4 w-4" />
        </button>

        {/* Save indicator / button (only when editing) */}
        {showSource && (
          <>
            <div className="w-px h-4 bg-border mx-0.5" />
            <button
              onClick={handleSaveNow}
              disabled={!hasUnsavedChanges || isSaving}
              className={cn(
                "p-1.5 rounded-md transition-colors",
                "hover:bg-accent",
                hasUnsavedChanges
                  ? "text-amber-500"
                  : "text-muted-foreground/50"
              )}
              title={hasUnsavedChanges ? "Save now (auto-saves)" : "Saved"}
            >
              {isSaving ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : hasUnsavedChanges ? (
                <Save className="h-4 w-4" />
              ) : (
                <Check className="h-4 w-4" />
              )}
            </button>
          </>
        )}
      </div>

      {/* Source editor panel - slides in from top */}
      {showSource && (
        <div className="absolute inset-x-0 top-0 z-[5] bg-background border-b shadow-lg">
          <div className="max-h-[50vh] overflow-auto">
            <textarea
              value={editedSource ?? ""}
              onChange={(e) => setEditedSource(e.target.value)}
              className={cn(
                "w-full min-h-[200px] p-4 font-mono text-sm leading-relaxed",
                "bg-muted/30 resize-none",
                "focus:outline-none focus:bg-muted/50",
                "placeholder:text-muted-foreground/50"
              )}
              placeholder="// Block source code..."
              spellCheck={false}
              autoFocus
            />
          </div>
          {/* Status bar */}
          <div className="flex items-center justify-between px-4 py-1.5 border-t bg-muted/30 text-xs text-muted-foreground">
            <span>{sourceData?.filePath || blockId}</span>
            <span>
              {isSaving
                ? "Saving..."
                : hasUnsavedChanges
                  ? "Unsaved changes"
                  : "Saved"}
            </span>
          </div>
        </div>
      )}

      {/* Block preview - renders the actual RSC block */}
      <div className={cn("h-full overflow-auto p-6", showSource && "pt-[calc(50vh+1rem)]")}>
        {isWaitingForRuntime ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="h-2 w-2 rounded-full bg-yellow-500 animate-pulse mx-auto mb-2" />
              <span className="text-sm text-muted-foreground">
                Starting runtime...
              </span>
            </div>
          </div>
        ) : blockData?.error ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-destructive">
              <p className="font-medium">Error loading block</p>
              <p className="text-sm mt-1">{blockData.error}</p>
            </div>
          </div>
        ) : loading ? (
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-muted rounded w-1/3" />
            <div className="h-32 bg-muted rounded" />
          </div>
        ) : blockData?.element ? (
          <RscErrorBoundary resetKey={blockId} onRetry={handleRefresh}>
            <Suspense
              fallback={
                <div className="animate-pulse space-y-4">
                  <div className="h-8 bg-muted rounded w-1/3" />
                  <div className="h-32 bg-muted rounded" />
                </div>
              }
            >
              {blockData.element}
            </Suspense>
          </RscErrorBoundary>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            No content
          </div>
        )}
      </div>
    </div>
  );
}
