/**
 * WorkbookTitleEditor
 *
 * Inline editable workbook title with save status dot and publish/share button.
 * Linear app style - click to edit, blur or Enter to save.
 *
 * Publish flow:
 * - Unpublished: Shows "Publish" button to deploy to viewer
 * - Published: Shows viewer URL (view.hands.app) with click-to-copy
 *
 * Saves to SQLite _workbook table (source of truth) and syncs to IndexedDB cache.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, Loader2 } from "lucide-react";
import { CloudArrowUp } from "@phosphor-icons/react";
import { updateWorkbookCache } from "../shared/lib/storage";
import { useLocalDatabase } from "../db/LocalDatabaseProvider";
import { trpc } from "../lib/trpc";
import { cn } from "@hands/app/light";

interface WorkbookTitleEditorProps {
  workbookId: string;
  name: string;
  onNameChange?: (newName: string) => void;
}

interface DeployStatus {
  deployed: boolean;
  url: string | null;
  d1DatabaseId: string | null;
  deployedAt: string | null;
}

export function WorkbookTitleEditor({
  workbookId,
  name,
  onNameChange,
}: WorkbookTitleEditorProps) {
  const { updateWorkbookMeta } = useLocalDatabase();
  const titleRef = useRef<HTMLSpanElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showDotMenu, setShowDotMenu] = useState(false);
  const [showSharePopover, setShowSharePopover] = useState(false);
  const [copied, setCopied] = useState(false);
  const dotMenuRef = useRef<HTMLDivElement>(null);
  const sharePopoverRef = useRef<HTMLDivElement>(null);
  const shareHoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Deploy status query
  const { data: deployStatus, refetch: refetchDeploy } = trpc["viewerDeploy.status"].useQuery(
    undefined,
    { enabled: !!workbookId }
  ) as { data: DeployStatus | undefined; refetch: () => void };

  // Publish mutation
  const publishMutation = trpc["viewerDeploy.publish"].useMutation({
    onSuccess: () => {
      refetchDeploy();
    },
  });

  const isPublishing = publishMutation.isPending;
  const isDeployed = deployStatus?.deployed ?? false;
  const viewerUrl = deployStatus?.url ?? null;

  // Display URL (without protocol)
  const displayUrl = viewerUrl?.replace(/^https?:\/\//, "") ?? "";

  // Copy URL to clipboard
  const handleCopyUrl = useCallback(async () => {
    if (!viewerUrl) return;
    try {
      await navigator.clipboard.writeText(viewerUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("[WorkbookTitleEditor] Copy failed:", err);
    }
  }, [viewerUrl]);

  // Publish workbook
  const handlePublish = useCallback(async () => {
    try {
      await publishMutation.mutateAsync(undefined);
    } catch (err) {
      console.error("[WorkbookTitleEditor] Publish failed:", err);
    }
  }, [publishMutation]);

  // Share popover hover handlers
  const handleShareMouseEnter = useCallback(() => {
    if (shareHoverTimeout.current) {
      clearTimeout(shareHoverTimeout.current);
      shareHoverTimeout.current = null;
    }
    setShowSharePopover(true);
  }, []);

  const handleShareMouseLeave = useCallback(() => {
    shareHoverTimeout.current = setTimeout(() => {
      setShowSharePopover(false);
    }, 150);
  }, []);

  // Handle blur - save if changed
  const handleBlur = useCallback(async () => {
    setIsEditing(false);
    const newName = titleRef.current?.textContent?.trim() || "";

    if (!newName) {
      // Restore original name if empty
      if (titleRef.current) titleRef.current.textContent = name;
      return;
    }

    if (newName !== name) {
      setIsSaving(true);
      try {
        // Save to SQLite (source of truth)
        const updated = await updateWorkbookMeta(newName);
        if (updated) {
          // Sync to IndexedDB cache
          await updateWorkbookCache(workbookId, newName);
          onNameChange?.(newName);
        }
      } catch (err) {
        console.error("[WorkbookTitleEditor] Rename failed:", err);
        if (titleRef.current) titleRef.current.textContent = name;
      } finally {
        setIsSaving(false);
      }
    }
  }, [workbookId, name, onNameChange, updateWorkbookMeta]);

  // Handle keyboard
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        titleRef.current?.blur();
      } else if (e.key === "Escape") {
        if (titleRef.current) titleRef.current.textContent = name;
        titleRef.current?.blur();
      }
    },
    [name]
  );

  // Close dot menu on outside click
  useEffect(() => {
    if (!showDotMenu) return;

    const handleClick = (e: MouseEvent) => {
      if (dotMenuRef.current && !dotMenuRef.current.contains(e.target as Node)) {
        setShowDotMenu(false);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowDotMenu(false);
    };

    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [showDotMenu]);

  // Sync name if it changes externally
  useEffect(() => {
    if (titleRef.current && !isEditing) {
      titleRef.current.textContent = name;
    }
  }, [name, isEditing]);

  // Cleanup hover timeout on unmount
  useEffect(() => {
    return () => {
      if (shareHoverTimeout.current) {
        clearTimeout(shareHoverTimeout.current);
      }
    };
  }, []);

  // Dot color
  const dotColor = isSaving
    ? "bg-white animate-pulse"
    : "bg-green-500";

  return (
    <div className="flex items-center gap-1">
      {/* Editable title */}
      <span
        ref={titleRef}
        contentEditable
        suppressContentEditableWarning
        onFocus={() => setIsEditing(true)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className={cn(
          "px-1.5 py-0.5 text-sm font-medium bg-transparent rounded-md cursor-text",
          "outline-none truncate max-w-[200px]",
          "hover:bg-accent/50",
          "focus:bg-background focus:ring-1 focus:ring-ring/30"
        )}
        spellCheck={false}
      >
        {name}
      </span>

      {/* Save status dot with popover - after title */}
      <div className="relative">
        <button
          onClick={() => setShowDotMenu(!showDotMenu)}
          className={cn(
            "flex items-center justify-center w-4 h-4 rounded-sm transition-colors cursor-pointer",
            showDotMenu ? "bg-accent" : "hover:bg-accent/50"
          )}
          title={isSaving ? "Saving..." : "Saved"}
        >
          <span
            className={cn(
              "w-1.5 h-1.5 rounded-full transition-colors",
              dotColor
            )}
          />
        </button>

        {/* Dot menu popover */}
        {showDotMenu && (
          <div
            ref={dotMenuRef}
            className="absolute left-0 top-full mt-2 w-56 bg-popover border border-border rounded-xl shadow-xl z-50"
          >
            <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border/50">
              <span
                className={cn("w-1.5 h-1.5 rounded-full shrink-0", dotColor)}
              />
              <span className="text-[11px] text-muted-foreground">
                {isSaving ? "Saving..." : "All changes saved"}
              </span>
            </div>
            <div className="px-3 py-3 text-center text-[11px] text-muted-foreground">
              Changes are saved automatically
            </div>
          </div>
        )}
      </div>

      {/* Publish button or Published URL */}
      {isDeployed && viewerUrl ? (
        /* Published: Show viewer URL with copy */
        <div
          className="relative"
          onMouseEnter={handleShareMouseEnter}
          onMouseLeave={handleShareMouseLeave}
        >
          <button
            onClick={handleCopyUrl}
            className={cn(
              "flex items-center gap-1.5 h-6 px-2 rounded-md transition-all cursor-pointer",
              "bg-green-500/10 border border-green-500/30",
              "text-green-600 dark:text-green-400 hover:bg-green-500/20",
              copied && "border-green-500/50"
            )}
          >
            <span className="text-[11px] truncate max-w-[160px] font-mono">
              {displayUrl}
            </span>
            {copied ? (
              <Check className="w-3 h-3 shrink-0" />
            ) : (
              <Copy className="w-3 h-3 shrink-0 opacity-70" />
            )}
          </button>

          {/* Hover popover with republish option */}
          {showSharePopover && (
            <div
              ref={sharePopoverRef}
              className="absolute left-0 top-full mt-2 w-72 bg-popover border border-border rounded-xl shadow-xl z-50"
            >
              {/* Status */}
              <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border/50">
                <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                <span className="text-xs text-foreground font-medium">Published</span>
                <span className="text-[11px] text-muted-foreground">Anyone with the link can view</span>
              </div>

              {/* Full URL with copy */}
              <div className="p-2">
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    readOnly
                    value={viewerUrl}
                    onClick={(e) => e.currentTarget.select()}
                    className="flex-1 min-w-0 h-7 px-2 text-[11px] font-mono bg-muted/50 border border-border/50 rounded-md outline-none focus:border-border"
                  />
                  <button
                    onClick={handleCopyUrl}
                    className={cn(
                      "flex items-center justify-center shrink-0 h-7 px-2.5 rounded-md text-[11px] font-medium transition-colors",
                      copied
                        ? "bg-green-500/20 text-green-600"
                        : "bg-primary text-primary-foreground hover:bg-primary/90"
                    )}
                  >
                    {copied ? (
                      <>
                        <Check className="w-3 h-3 mr-1" />
                        Copied
                      </>
                    ) : (
                      "Copy"
                    )}
                  </button>
                </div>

                {/* Republish button */}
                <button
                  onClick={handlePublish}
                  disabled={isPublishing}
                  className={cn(
                    "w-full mt-2 h-7 text-[11px] rounded-md transition-colors",
                    "bg-muted hover:bg-accent text-muted-foreground hover:text-foreground",
                    "disabled:opacity-50 disabled:cursor-not-allowed"
                  )}
                >
                  {isPublishing ? (
                    <span className="flex items-center justify-center gap-1.5">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Publishing...
                    </span>
                  ) : (
                    "Republish"
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Unpublished: Show Publish button */
        <button
          onClick={handlePublish}
          disabled={isPublishing}
          className={cn(
            "flex items-center gap-1.5 h-6 px-2.5 rounded-md transition-all cursor-pointer",
            "bg-primary text-primary-foreground hover:bg-primary/90",
            "disabled:opacity-50 disabled:cursor-not-allowed"
          )}
        >
          {isPublishing ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin" />
              <span className="text-[11px] font-medium">Publishing...</span>
            </>
          ) : (
            <>
              <CloudArrowUp weight="bold" className="w-3.5 h-3.5" />
              <span className="text-[11px] font-medium">Publish</span>
            </>
          )}
        </button>
      )}
    </div>
  );
}
