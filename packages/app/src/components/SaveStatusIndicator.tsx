/**
 * SaveStatusIndicator
 *
 * Displays workbook save/git status in the title bar.
 * Shows a dot indicator (clean/dirty) and opens a compact popover with:
 * - Local tab: save history, revert, checkpoint
 * - Publish tab: deploy to Workers, share links
 * Supports Cmd+S to save.
 */

import {
  ArrowSquareOut,
  Check,
  CircleNotch,
  ClockCounterClockwise,
  CloudArrowDown,
  CloudArrowUp,
  Copy,
  Database,
  Rocket,
  Warning,
} from "@phosphor-icons/react";
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
import { useRuntimeState } from "@/hooks/useRuntimeState";
import { trpc } from "@/hooks/useTRPC";
import { cn } from "@/lib/utils";

type TabType = "local" | "publish";

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
  // Git/local state
  const { data: status, isLoading: statusLoading } = useGitStatus();
  const { data: diffStats } = useGitDiffStats();
  const { data: history } = useGitHistory(10);
  const save = useGitSave();
  const revert = useGitRevert();
  const [revertingHash, setRevertingHash] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>("local");
  const [isOpen, setIsOpen] = useState(false);

  // Deploy/publish state
  const { port: runtimePort } = useRuntimeState();
  const [includeDb, setIncludeDb] = useState(false);
  const [copied, setCopied] = useState(false);

  const publishMutation = trpc.deploy.publish.useMutation();
  const pushDbMutation = trpc.deploy.pushDb.useMutation();
  const pullDbMutation = trpc.deploy.pullDb.useMutation();
  const statusQuery = trpc.deploy.status.useQuery(undefined, {
    enabled: isOpen && activeTab === "publish",
    staleTime: 30000,
  });

  // Worker port is runtime + 200 (e.g., 55000 -> 55200)
  const workerPort = runtimePort ? runtimePort + 200 : null;
  const previewUrl = workerPort ? `http://localhost:${workerPort}` : null;
  const displayUrl = workerPort ? `localhost:${workerPort}` : null;

  const handleDeploy = () => {
    publishMutation.mutate({ includeDb });
  };

  const handlePushDb = () => {
    pushDbMutation.mutate(undefined);
  };

  const handlePullDb = () => {
    pullDbMutation.mutate(undefined);
  };

  const handleCopyUrl = async (url: string) => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const openUrl = async (url: string) => {
    try {
      const { open } = await import("@tauri-apps/plugin-shell");
      await open(url);
    } catch {
      window.open(url, "_blank");
    }
  };

  const isDeploying = publishMutation.isPending;
  const isPushingDb = pushDbMutation.isPending;
  const isPullingDb = pullDbMutation.isPending;
  const deployError = publishMutation.error?.message || publishMutation.data?.error;
  const deploySuccess = publishMutation.isSuccess && publishMutation.data?.success;
  const pushDbSuccess = pushDbMutation.isSuccess && pushDbMutation.data?.success;
  const pullDbSuccess = pullDbMutation.isSuccess && pullDbMutation.data?.success;

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
  }, [handleSave]);

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
    <Popover open={isOpen} onOpenChange={setIsOpen}>
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

      <PopoverContent side="bottom" align="start" className="w-[260px] p-0">
        {/* Tab switcher */}
        <div className="flex border-b border-border/50">
          <button
            onClick={() => setActiveTab("local")}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-[11px] font-medium transition-colors",
              activeTab === "local"
                ? "text-foreground border-b-2 border-primary -mb-px"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <ClockCounterClockwise weight="bold" className="h-3 w-3" />
            Local
          </button>
          <button
            onClick={() => setActiveTab("publish")}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-[11px] font-medium transition-colors",
              activeTab === "publish"
                ? "text-foreground border-b-2 border-primary -mb-px"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Rocket weight="bold" className="h-3 w-3" />
            Publish
          </button>
        </div>

        {/* Local tab content */}
        {activeTab === "local" && (
          <>
            {/* Status and save button */}
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
                {showBranch && (
                  <span className="text-[10px] text-muted-foreground/50">({branch})</span>
                )}
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
          </>
        )}

        {/* Publish tab content */}
        {activeTab === "publish" && (
          <div className="py-2 space-y-2">
            {/* Local preview URL */}
            <div className="px-2.5">
              <div className="text-[10px] text-muted-foreground mb-1">Local preview</div>
              {runtimePort && previewUrl ? (
                <div className="flex items-center gap-1">
                  <div className="flex-1 px-2 py-1 text-[10px] font-mono bg-muted rounded truncate">
                    {displayUrl}
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => handleCopyUrl(previewUrl)}
                        className="p-1 rounded hover:bg-accent transition-colors"
                      >
                        {copied ? (
                          <Check weight="bold" className="h-3 w-3 text-green-500" />
                        ) : (
                          <Copy weight="bold" className="h-3 w-3 text-muted-foreground" />
                        )}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-[10px]">
                      Copy
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => openUrl(previewUrl)}
                        className="p-1 rounded hover:bg-accent transition-colors"
                      >
                        <ArrowSquareOut weight="bold" className="h-3 w-3 text-muted-foreground" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-[10px]">
                      Open
                    </TooltipContent>
                  </Tooltip>
                </div>
              ) : (
                <p className="text-[10px] text-muted-foreground/50">Start runtime to preview</p>
              )}
            </div>

            {/* Deployed URL */}
            {statusQuery.data?.deployed && statusQuery.data.url && (
              <div className="px-2.5">
                <div className="text-[10px] text-muted-foreground mb-1">Production</div>
                <div className="flex items-center gap-1">
                  <div className="flex-1 px-2 py-1 text-[10px] font-mono bg-muted rounded truncate">
                    {statusQuery.data.url.replace("https://", "")}
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => openUrl(statusQuery.data.url!)}
                        className="p-1 rounded hover:bg-accent transition-colors"
                      >
                        <ArrowSquareOut weight="bold" className="h-3 w-3 text-muted-foreground" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-[10px]">
                      Open
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>
            )}

            {/* Deploy success */}
            {deploySuccess && publishMutation.data?.url && (
              <div className="mx-2.5 p-2 bg-green-500/10 border border-green-500/20 rounded-md">
                <div className="flex items-center gap-1 text-[10px] text-green-600 dark:text-green-400">
                  <Check weight="bold" className="h-3 w-3" />
                  Deployed!
                </div>
              </div>
            )}

            {/* Deploy error */}
            {deployError && (
              <div className="mx-2.5 p-2 bg-red-500/10 border border-red-500/20 rounded-md">
                <div className="flex items-start gap-1 text-[10px] text-red-600 dark:text-red-400">
                  <Warning weight="bold" className="h-3 w-3 shrink-0 mt-0.5" />
                  <span className="truncate">{deployError}</span>
                </div>
              </div>
            )}

            {/* Deploy section */}
            <div className="px-2.5 pt-1 border-t border-border/50">
              <label className="flex items-center gap-1.5 text-[10px] cursor-pointer py-1">
                <input
                  type="checkbox"
                  checked={includeDb}
                  onChange={(e) => setIncludeDb(e.target.checked)}
                  className="rounded border-border h-3 w-3"
                />
                <Database weight="bold" className="h-3 w-3 text-muted-foreground" />
                Include database
              </label>

              <button
                onClick={handleDeploy}
                disabled={isDeploying}
                className={cn(
                  "w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium",
                  "bg-primary text-primary-foreground hover:bg-primary/90",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                  "transition-colors",
                )}
              >
                {isDeploying ? (
                  <>
                    <CircleNotch weight="bold" className="h-3 w-3 animate-spin" />
                    Deploying...
                  </>
                ) : (
                  <>
                    <Rocket weight="bold" className="h-3 w-3" />
                    {statusQuery.data?.deployed ? "Redeploy" : "Deploy"}
                  </>
                )}
              </button>
            </div>

            {/* Database sync section - only if deployed */}
            {statusQuery.data?.deployed && (
              <div className="px-2.5 pt-1 border-t border-border/50">
                <div className="text-[10px] text-muted-foreground mb-1.5">Sync database</div>

                {pushDbSuccess && (
                  <div className="flex items-center gap-1 text-[10px] text-green-600 dark:text-green-400 mb-1">
                    <Check weight="bold" className="h-3 w-3" />
                    Pushed to production
                  </div>
                )}
                {pullDbSuccess && (
                  <div className="flex items-center gap-1 text-[10px] text-green-600 dark:text-green-400 mb-1">
                    <Check weight="bold" className="h-3 w-3" />
                    Pulled from production
                  </div>
                )}

                <div className="flex gap-1.5">
                  <button
                    onClick={handlePushDb}
                    disabled={isPushingDb || isPullingDb}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium",
                      "bg-secondary text-secondary-foreground hover:bg-secondary/80",
                      "disabled:opacity-50 disabled:cursor-not-allowed",
                      "transition-colors",
                    )}
                  >
                    {isPushingDb ? (
                      <CircleNotch weight="bold" className="h-3 w-3 animate-spin" />
                    ) : (
                      <CloudArrowUp weight="bold" className="h-3 w-3" />
                    )}
                    Push
                  </button>
                  <button
                    onClick={handlePullDb}
                    disabled={isPushingDb || isPullingDb}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium",
                      "bg-secondary text-secondary-foreground hover:bg-secondary/80",
                      "disabled:opacity-50 disabled:cursor-not-allowed",
                      "transition-colors",
                    )}
                  >
                    {isPullingDb ? (
                      <CircleNotch weight="bold" className="h-3 w-3 animate-spin" />
                    ) : (
                      <CloudArrowDown weight="bold" className="h-3 w-3" />
                    )}
                    Pull
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
