/**
 * ShareButton - Share workbook via local preview or publish
 *
 * Two tabs:
 * - Local: Preview URL for local development
 * - Publish: Deploy code and sync database to/from production
 */

import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useRuntimeState } from "@/hooks/useRuntimeState";
import { trpc } from "@/hooks/useTRPC";
import { cn } from "@/lib/utils";
import {
  ArrowSquareOut,
  Check,
  CircleNotch,
  CloudArrowDown,
  CloudArrowUp,
  Copy,
  Database,
  Globe,
  Rocket,
  Warning,
} from "@phosphor-icons/react";

interface ShareButtonProps {
  /** Page route to append to base URL (e.g., "/pages/dashboard") */
  pageRoute?: string;
}

export function PreviewButton({ pageRoute = "" }: ShareButtonProps) {
  const { port: runtimePort } = useRuntimeState();
  const [includeDb, setIncludeDb] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const publishMutation = trpc.deploy.publish.useMutation();
  const pushDbMutation = trpc.deploy.pushDb.useMutation();
  const pullDbMutation = trpc.deploy.pullDb.useMutation();
  // Only fetch status when popover is open (decoupled from page load)
  const statusQuery = trpc.deploy.status.useQuery(undefined, {
    enabled: isOpen,
    staleTime: 30000,
  });

  // Worker port is runtime + 200 (e.g., 55000 -> 55200)
  const workerPort = runtimePort ? runtimePort + 200 : null;
  const previewUrl = workerPort
    ? `http://localhost:${workerPort}${pageRoute}`
    : null;
  const displayUrl = workerPort
    ? `localhost:${workerPort}${pageRoute}`
    : null;

  const handleDeploy = () => {
    publishMutation.mutate({ includeDb });
  };

  const handlePushDb = () => {
    pushDbMutation.mutate(undefined);
  };

  const handlePullDb = () => {
    pullDbMutation.mutate(undefined);
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

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "px-2 py-1 rounded-md text-[12px] font-medium transition-colors",
            runtimePort
              ? "text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10"
              : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
          )}
        >
          <span className="flex items-center gap-1">
            <Globe weight="duotone" className="h-3.5 w-3.5" />
            Share
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <Tabs defaultValue="local" className="w-full">
          <TabsList className="w-full grid grid-cols-2 rounded-none border-b">
            <TabsTrigger value="local" className="rounded-none">
              Local
            </TabsTrigger>
            <TabsTrigger value="publish" className="rounded-none">
              Publish
            </TabsTrigger>
          </TabsList>

          {/* Local Tab */}
          <TabsContent value="local" className="p-3 mt-0">
            <div className="text-sm font-medium mb-2">Local preview</div>
            {runtimePort && previewUrl ? (
              <div className="flex items-center gap-2">
                <div className="flex-1 px-2 py-1.5 text-xs font-mono bg-muted rounded-md truncate">
                  {displayUrl}
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => navigator.clipboard.writeText(previewUrl)}
                      className="p-1.5 rounded-md hover:bg-accent transition-colors"
                    >
                      <Copy weight="duotone" className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Copy link</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => openUrl(previewUrl)}
                      className="p-1.5 rounded-md hover:bg-accent transition-colors"
                    >
                      <ArrowSquareOut weight="duotone" className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Open in browser</TooltipContent>
                </Tooltip>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Start the runtime to preview
              </p>
            )}
          </TabsContent>

          {/* Publish Tab */}
          <TabsContent value="publish" className="p-3 mt-0 space-y-3">
            {/* Current deployment status */}
            {statusQuery.data?.deployed && (
              <div className="flex items-center gap-2">
                <div className="flex-1 px-2 py-1.5 text-xs font-mono bg-muted rounded-md truncate">
                  {statusQuery.data.url?.replace("https://", "")}
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => openUrl(statusQuery.data.url!)}
                      className="p-1.5 rounded-md hover:bg-accent transition-colors"
                    >
                      <ArrowSquareOut weight="duotone" className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Open deployed site</TooltipContent>
                </Tooltip>
              </div>
            )}

            {/* Deploy success */}
            {deploySuccess && publishMutation.data?.url && (
              <div className="p-2 bg-green-500/10 border border-green-500/20 rounded-md">
                <div className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400 mb-1">
                  <Check weight="bold" className="h-3.5 w-3.5" />
                  Deployed!
                </div>
                <button
                  onClick={() => openUrl(publishMutation.data.url!)}
                  className="text-xs text-primary hover:underline truncate block"
                >
                  {publishMutation.data.url}
                </button>
              </div>
            )}

            {/* Deploy error */}
            {deployError && (
              <div className="p-2 bg-red-500/10 border border-red-500/20 rounded-md">
                <div className="flex items-start gap-1.5 text-xs text-red-600 dark:text-red-400">
                  <Warning weight="bold" className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>{deployError}</span>
                </div>
              </div>
            )}

            {/* Deploy Code Section */}
            <div className="space-y-2">
              <div className="text-sm font-medium">Deploy app</div>

              {/* Include DB checkbox */}
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeDb}
                  onChange={(e) => setIncludeDb(e.target.checked)}
                  className="rounded border-border"
                />
                <Database weight="duotone" className="h-3.5 w-3.5 text-muted-foreground" />
                Include local database
              </label>

              <button
                onClick={handleDeploy}
                disabled={isDeploying}
                className={cn(
                  "w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                  isDeploying
                    ? "bg-muted text-muted-foreground cursor-not-allowed"
                    : "bg-primary text-primary-foreground hover:bg-primary/90"
                )}
              >
                {isDeploying ? (
                  <>
                    <CircleNotch weight="bold" className="h-3.5 w-3.5 animate-spin" />
                    Deploying...
                  </>
                ) : (
                  <>
                    <Rocket weight="duotone" className="h-3.5 w-3.5" />
                    {statusQuery.data?.deployed ? "Redeploy" : "Deploy"}
                  </>
                )}
              </button>
            </div>

            {/* Database Sync Section */}
            {statusQuery.data?.deployed && (
              <div className="space-y-2 pt-2 border-t border-border">
                <div className="text-sm font-medium">Sync database</div>

                {/* Push/Pull success messages */}
                {pushDbSuccess && (
                  <div className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
                    <Check weight="bold" className="h-3.5 w-3.5" />
                    Database pushed to production
                  </div>
                )}
                {pullDbSuccess && (
                  <div className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
                    <Check weight="bold" className="h-3.5 w-3.5" />
                    Database pulled from production
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={handlePushDb}
                    disabled={isPushingDb || isPullingDb}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                      isPushingDb || isPullingDb
                        ? "bg-muted text-muted-foreground cursor-not-allowed"
                        : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                    )}
                  >
                    {isPushingDb ? (
                      <CircleNotch weight="bold" className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <CloudArrowUp weight="duotone" className="h-3.5 w-3.5" />
                    )}
                    Push
                  </button>
                  <button
                    onClick={handlePullDb}
                    disabled={isPushingDb || isPullingDb}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                      isPushingDb || isPullingDb
                        ? "bg-muted text-muted-foreground cursor-not-allowed"
                        : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                    )}
                  >
                    {isPullingDb ? (
                      <CircleNotch weight="bold" className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <CloudArrowDown weight="duotone" className="h-3.5 w-3.5" />
                    )}
                    Pull
                  </button>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Push uploads local DB to production. Pull downloads production DB locally.
                </p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </PopoverContent>
    </Popover>
  );
}

// Keep old name for backwards compatibility
export { PreviewButton as ShareButton };
