/**
 * SaveStatusIndicator
 *
 * Unified save/deploy status in the title bar.
 * Shows combined state: unsaved → saved → deployed
 */

import {
  ArrowSquareOut,
  Check,
  CircleNotch,
  ClockCounterClockwise,
  Copy,
  Database,
  Rocket,
} from "@phosphor-icons/react";
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
import { trpc } from "@/hooks/useTRPC";
import { cn } from "@/lib/utils";

function formatCompactTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);

  if (seconds < 60) return `${seconds}s`;
  if (minutes < 60) return `${minutes}m`;
  if (hours < 24) return `${hours}h`;
  if (days < 7) return `${days}d`;
  return `${weeks}w`;
}

export function SaveStatusIndicator() {
  const { data: status, isLoading: statusLoading } = useGitStatus();
  const { data: diffStats } = useGitDiffStats();
  const { data: history } = useGitHistory(10);
  const save = useGitSave();
  const revert = useGitRevert();
  const [revertingHash, setRevertingHash] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // Deploy status and mutation (using viewer deploy - no build step)
  const statusQuery = trpc.viewerDeploy.status.useQuery(undefined, {
    staleTime: 30000,
  });
  const deployMutation = trpc.viewerDeploy.publish.useMutation({
    onSuccess: () => {
      statusQuery.refetch();
    },
  });

  const hasChanges = status?.hasChanges ?? false;
  const isDeployed = statusQuery.data?.deployed ?? false;
  const deployedUrl = statusQuery.data?.url ?? undefined;
  const isDeploying = deployMutation.isPending;
  const isSaving = save.isPending;

  // Determine overall state
  const getState = () => {
    if (isSaving) return "saving";
    if (isDeploying) return "deploying";
    if (hasChanges) return "unsaved";
    if (!isDeployed) return "not-deployed";
    return "deployed";
  };
  const state = getState();

  // Dot color based on state
  const getDotColor = () => {
    switch (state) {
      case "saving":
      case "deploying":
        return "bg-white animate-pulse";
      case "unsaved":
        return "bg-amber-500";
      case "not-deployed":
        return "bg-blue-500";
      case "deployed":
        return "bg-green-500";
      default:
        return "bg-muted-foreground/50";
    }
  };

  // Status text
  const getStatusText = () => {
    switch (state) {
      case "saving":
        return "Saving...";
      case "deploying":
        return "Deploying...";
      case "unsaved":
        return "Unsaved changes";
      case "not-deployed":
        return "Saved · Not deployed";
      case "deployed":
        return "Saved · Deployed";
      default:
        return "Checking...";
    }
  };

  const handleSave = async () => {
    if (save.isPending || deployMutation.isPending) return;
    try {
      await save.mutateAsync(undefined);
      // Auto-deploy after save (viewer deploy - uploads MDX + data to D1)
      deployMutation.mutate({ includeData: true });
    } catch (err) {
      console.error("[SaveStatusIndicator] Save failed:", err);
    }
  };

  const handleRevert = async (hash: string) => {
    if (revert.isPending) return;
    setRevertingHash(hash);
    try {
      await revert.mutateAsync(hash);
      window.location.reload();
    } catch (err) {
      console.error("[SaveStatusIndicator] Revert failed:", err);
      setRevertingHash(null);
    }
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
              <span className={cn("w-2 h-2 rounded-full transition-colors", getDotColor())} />
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-[11px]">
          {getStatusText()}
        </TooltipContent>
      </Tooltip>

      <PopoverContent side="bottom" align="start" className="w-[260px] p-0">
        {/* Status header with action button */}
        <div className="flex items-center justify-between px-2.5 py-2 border-b border-border/50">
          <div className="flex items-center gap-1.5">
            <span
              className={cn("w-1.5 h-1.5 rounded-full shrink-0", getDotColor())}
            />
            <span className="text-[11px] text-muted-foreground">
              {getStatusText()}
            </span>
          </div>
          {/* Save button - auto-deploys after save */}
          {state === "unsaved" && (
            <button
              onClick={handleSave}
              disabled={isSaving || isDeploying}
              className="text-[11px] font-medium text-primary hover:underline disabled:opacity-50"
            >
              Save
            </button>
          )}
          {/* Deploy button for first-time or retry */}
          {(state === "not-deployed" || deployMutation.error) && state !== "unsaved" && (
            <button
              onClick={() => deployMutation.mutate({ includeData: true })}
              disabled={isDeploying}
              className="flex items-center gap-1 text-[11px] font-medium text-primary hover:underline disabled:opacity-50"
            >
              <Rocket weight="bold" className="h-3 w-3" />
              {deployMutation.error ? "Retry" : "Deploy"}
            </button>
          )}
        </div>

        {/* Diff stats */}
        {hasChanges && diffStats && (
          <div className="px-2.5 py-2 border-b border-border/50">
            <div className="flex flex-wrap items-center gap-3 text-[10px]">
              {diffStats.hasDbChange && (
                <div className="flex items-center gap-1 text-blue-500">
                  <Database weight="fill" className="h-3 w-3" />
                  <span>db changed</span>
                </div>
              )}
              {(diffStats.filesChanged > 0 || diffStats.insertions > 0 || diffStats.deletions > 0) && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  {diffStats.filesChanged > 0 && (
                    <span>{diffStats.filesChanged} file{diffStats.filesChanged !== 1 ? "s" : ""}</span>
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

        {/* Deploy error */}
        {deployMutation.error && (
          <div className="px-2.5 py-2 border-b border-border/50">
            <div className="text-[10px] text-red-500 truncate">
              {deployMutation.error.message}
            </div>
          </div>
        )}

        {/* Deployed URL */}
        {isDeployed && deployedUrl && (
          <div className="px-2.5 py-2 border-b border-border/50">
            <div className="flex items-center gap-1">
              <div className="flex-1 px-2 py-1 text-[10px] font-mono bg-muted rounded truncate">
                {deployedUrl.replace("https://", "")}
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => handleCopyUrl(deployedUrl)}
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
                    onClick={() => openUrl(deployedUrl)}
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

        {/* Version history */}
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
              {statusLoading ? "Loading..." : "No history yet"}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
