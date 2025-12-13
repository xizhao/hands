/**
 * SaveStatusIndicator
 *
 * Displays workbook save/git status in the title bar.
 * Shows a dot indicator (clean/dirty) and opens a compact popover with history.
 * Supports Cmd+S to save.
 */

import { CircleNotch, ClockCounterClockwise, Database } from "@phosphor-icons/react";
import { formatDistanceToNow } from "date-fns";
import { useEffect, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  useGitDiffStats,
  useGitHistory,
  useGitRevert,
  useGitSave,
  useGitStatus,
} from "@/hooks/useGit";
import { cn } from "@/lib/utils";

/**
 * Format bytes as a human-readable size string
 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/**
 * Format size difference with +/- prefix
 */
function formatSizeDiff(current: number | null, previous: number | null): string {
  if (current === null) return "new";
  if (previous === null) return formatSize(current);
  const diff = current - previous;
  if (diff === 0) return "unchanged";
  const prefix = diff > 0 ? "+" : "";
  return `${prefix}${formatSize(Math.abs(diff))}`;
}

/**
 * Format a timestamp as a compact relative time string (e.g., "3m", "5d", "2w")
 */
function formatCompactTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (seconds < 60) return `${seconds}s`;
  if (minutes < 60) return `${minutes}m`;
  if (hours < 24) return `${hours}h`;
  if (days < 7) return `${days}d`;
  if (weeks < 5) return `${weeks}w`;
  if (months < 12) return `${months}mo`;
  return `${years}y`;
}

export function SaveStatusIndicator() {
  const { data: status, isLoading: statusLoading } = useGitStatus();
  const { data: diffStats } = useGitDiffStats();
  const { data: history } = useGitHistory(10);
  const save = useGitSave();
  const revert = useGitRevert();
  const [revertingHash, setRevertingHash] = useState<string | null>(null);

  // Derive state from git status
  const hasChanges = status?.hasChanges ?? false;
  const branch = status?.branch ?? "main";
  const showBranch = branch && branch !== "main";

  // Get last commit info
  const lastCommit = history?.[0];
  const lastSaveTime = lastCommit
    ? formatDistanceToNow(new Date(lastCommit.timestamp), { addSuffix: true })
    : null;

  const handleSave = async () => {
    if (save.isPending) return;
    try {
      await save.mutateAsync(undefined);
    } catch (err) {
      console.error("[SaveStatusIndicator] Save failed:", err);
    }
  };

  const handleRevert = async (hash: string) => {
    if (revert.isPending) return;
    setRevertingHash(hash);
    try {
      await revert.mutateAsync(hash);
      // After revert, the page should reload to reflect the changes
      window.location.reload();
    } catch (err) {
      console.error("[SaveStatusIndicator] Revert failed:", err);
      setRevertingHash(null);
    }
  };

  // Cmd+S keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [save.isPending]);

  // Tooltip text for hover
  const tooltipText = save.isPending
    ? "Saving..."
    : statusLoading
      ? "Checking..."
      : hasChanges
        ? "Unsaved changes"
        : lastSaveTime
          ? `Saved ${lastSaveTime}`
          : "All saved";

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              className={cn(
                "flex items-center justify-center w-5 h-5 rounded-sm transition-colors",
                "hover:bg-accent/50",
              )}
            >
              {/* Status dot */}
              <span
                className={cn(
                  "w-2 h-2 rounded-full transition-colors",
                  save.isPending
                    ? "bg-white animate-pulse"
                    : statusLoading
                      ? "bg-muted-foreground/50"
                      : hasChanges
                        ? "bg-amber-500"
                        : "bg-green-500",
                )}
              />
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-[11px]">
          {tooltipText}
        </TooltipContent>
      </Tooltip>

      <PopoverContent side="bottom" align="start" className="w-[240px] p-0">
        {/* Header with status and save button */}
        <div className="flex items-center justify-between px-2.5 py-2 border-b border-border/50">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground">
              {statusLoading
                ? "Checking..."
                : hasChanges
                  ? "Unsaved changes"
                  : lastSaveTime
                    ? `Saved ${lastSaveTime}`
                    : "All changes saved"}
            </span>
            {showBranch && <span className="text-[10px] text-muted-foreground/50">({branch})</span>}
          </div>
          {hasChanges && (
            <button
              onClick={handleSave}
              disabled={save.isPending}
              className={cn(
                "text-[11px] font-medium text-primary hover:underline",
                "disabled:opacity-50 disabled:no-underline",
              )}
            >
              {save.isPending ? (
                <span className="flex items-center gap-1">
                  <CircleNotch weight="bold" className="h-3 w-3 animate-spin" />
                  Saving
                </span>
              ) : (
                "Save"
              )}
            </button>
          )}
        </div>

        {/* Changed files summary (GitHub-style diff stats) */}
        {hasChanges && diffStats && (
          <div className="px-2.5 py-2 border-b border-border/50">
            <div className="flex flex-wrap items-center gap-3 text-[10px]">
              {/* Database size diff */}
              {diffStats.hasDbChange && (
                <div className="flex items-center gap-1 text-blue-500">
                  <Database weight="fill" className="h-3 w-3" />
                  <span className="tabular-nums">
                    {formatSizeDiff(diffStats.dbSizeCurrent, diffStats.dbSizeLastCommit)}
                  </span>
                </div>
              )}
              {/* Git diff stats for non-db files */}
              {(diffStats.filesChanged > 0 ||
                diffStats.insertions > 0 ||
                diffStats.deletions > 0) && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  {diffStats.filesChanged > 0 && (
                    <span>
                      {diffStats.filesChanged} file{diffStats.filesChanged !== 1 ? "s" : ""}
                    </span>
                  )}
                  {diffStats.insertions > 0 && (
                    <span className="text-green-500 tabular-nums">+{diffStats.insertions}</span>
                  )}
                  {diffStats.deletions > 0 && (
                    <span className="text-red-500 tabular-nums">-{diffStats.deletions}</span>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Version history - compact list */}
        <div className="max-h-[140px] overflow-y-auto">
          {history && history.length > 0 ? (
            <div className="py-1">
              {history.slice(0, 6).map((commit, i) => {
                const isReverting = revertingHash === commit.hash;
                const canRevert = i > 0 && !revert.isPending;

                return (
                  <div
                    key={commit.hash}
                    onClick={() => canRevert && handleRevert(commit.hash)}
                    className={cn(
                      "px-2.5 py-1 flex items-center gap-2 group",
                      canRevert ? "hover:bg-accent/50 cursor-pointer" : "cursor-default",
                      i === 0 && "bg-accent/20",
                    )}
                  >
                    <span className="text-[10px] text-muted-foreground/50 tabular-nums shrink-0 w-[24px]">
                      {formatCompactTime(commit.timestamp)}
                    </span>
                    <span
                      className={cn(
                        "text-[11px] truncate flex-1",
                        i === 0 ? "text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {commit.message}
                    </span>
                    {/* Revert indicator */}
                    {isReverting ? (
                      <CircleNotch
                        weight="bold"
                        className="h-3 w-3 text-muted-foreground animate-spin shrink-0"
                      />
                    ) : canRevert ? (
                      <ClockCounterClockwise
                        weight="bold"
                        className="h-3 w-3 text-muted-foreground/0 group-hover:text-muted-foreground/70 shrink-0 transition-colors"
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="px-2.5 py-3 text-center text-[11px] text-muted-foreground">
              {statusLoading ? "Loading..." : "No version history"}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
