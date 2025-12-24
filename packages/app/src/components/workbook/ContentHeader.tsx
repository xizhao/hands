/**
 * ContentHeader - Header for the content area with breadcrumb and actions
 *
 * Shows current route (page/source/table/action) with close button,
 * plus database, alerts, settings, and share buttons.
 */

import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
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
import { useDatabase } from "@/hooks/useDatabase";
import { useRightPanel, type RightPanelId } from "@/hooks/useNavState";
import { useRuntimeState } from "@/hooks/useRuntimeState";
import { useEvalResult } from "@/hooks/useWorkbook";
import { cn } from "@/lib/utils";
import {
  ArrowSquareOut,
  CircleNotch,
  Copy,
  Database,
  Gear,
  Globe,
  Warning,
  X,
} from "@phosphor-icons/react";
import { useRouter, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";

interface ContentHeaderProps {
  children?: ReactNode;
}

export function ContentHeader({ children }: ContentHeaderProps) {
  const router = useRouter();
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;

  // Extract route info
  const sourceMatch = currentPath.match(/^\/sources\/(.+)$/);
  const sourceId = sourceMatch?.[1];
  const tableMatch = currentPath.match(/^\/tables\/(.+)$/);
  const tableId = tableMatch?.[1];
  const pageMatch = currentPath.match(/^\/pages\/(.+)$/);
  const pageId = pageMatch?.[1];
  const actionMatch = currentPath.match(/^\/actions\/(.+)$/);
  const actionId = actionMatch?.[1];

  const isOnContentRoute = sourceId || tableId || pageId || actionId;

  // Runtime state
  const {
    workbookId: activeWorkbookId,
    port: runtimePort,
    manifest,
    isStarting,
  } = useRuntimeState();

  const { panel: rightPanel, togglePanel: toggleRightPanel } = useRightPanel();
  const { data: evalResult } = useEvalResult(activeWorkbookId);

  // Tunnel state
  const [tunnelUrl, setTunnelUrl] = useState<string | null>(null);
  const [tunnelStatus, setTunnelStatus] = useState<
    "connecting" | "connected" | "error"
  >("connecting");
  const [tunnelError, setTunnelError] = useState<string | null>(null);

  // Poll for tunnel status
  useEffect(() => {
    if (!runtimePort) {
      setTunnelUrl(null);
      setTunnelStatus("connecting");
      return;
    }

    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(`http://localhost:${runtimePort}/__hands__`);
        if (cancelled) return;
        const data = await res.json();
        setTunnelUrl(data.publicUrl || null);
        setTunnelStatus(data.status || "connecting");
        setTunnelError(data.error || null);
      } catch {
        if (cancelled) return;
        setTunnelStatus("connecting");
      }
    };

    poll();
    const interval = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [runtimePort]);

  // Derived state
  const isRuntimeReady = !!runtimePort;
  const isManifestLoading = !manifest && !!runtimePort;
  const isConnecting = isManifestLoading;
  const runtimeConnected = isRuntimeReady;
  const isDbLoading = isStarting;

  // Alert counts
  const alertErrors =
    (evalResult?.typescript?.errors?.length ?? 0) +
    (evalResult?.format?.errors?.length ?? 0);
  const alertWarnings = evalResult?.typescript?.warnings?.length ?? 0;
  const alertCount = alertErrors + alertWarnings;

  // Current items from manifest
  const currentSource = manifest?.sources?.find((s) => s.id === sourceId);
  const currentPage = manifest?.pages?.find(
    (p) => p.id === pageId || p.route === `/${pageId}`
  );
  const currentAction = manifest?.actions?.find((a) => a.id === actionId);

  const handleClose = () => {
    router.navigate({ to: "/" });
  };

  // On index route, show minimal header
  if (!isOnContentRoute) {
    return (
      <header
        data-tauri-drag-region
        className="h-10 flex items-center justify-between px-4 pt-0.5 shrink-0"
      >
        <div className="flex-1" />
        <HeaderActions
          rightPanel={rightPanel}
          toggleRightPanel={toggleRightPanel}
          isConnecting={isConnecting}
          runtimePort={runtimePort}
          isDbLoading={isDbLoading}
          runtimeConnected={runtimeConnected}
          alertCount={alertCount}
          alertErrors={alertErrors}
          alertWarnings={alertWarnings}
          tunnelUrl={tunnelUrl}
          tunnelStatus={tunnelStatus}
          tunnelError={tunnelError}
        />
      </header>
    );
  }

  // Content route header with breadcrumb
  return (
    <header
      data-tauri-drag-region
      className="h-10 flex items-center justify-between px-4 pt-0.5 shrink-0"
    >
      {/* Left: Breadcrumb */}
      <div className="flex items-center gap-1 group/breadcrumb">
        {sourceId && (
          <>
            <span className="px-1 py-0.5 text-sm text-foreground bg-transparent rounded-sm">
              {currentSource?.title || sourceId}
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleClose}
                  className="ml-1 p-0.5 rounded-sm text-muted-foreground/70 hover:text-muted-foreground hover:bg-accent/50 transition-colors opacity-0 group-hover/breadcrumb:opacity-100"
                >
                  <X weight="bold" className="h-3 w-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Close source</TooltipContent>
            </Tooltip>
          </>
        )}
        {tableId && (
          <>
            <span className="px-1 py-0.5 text-sm text-foreground bg-transparent rounded-sm">
              {tableId}
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleClose}
                  className="ml-1 p-0.5 rounded-sm text-muted-foreground/70 hover:text-muted-foreground hover:bg-accent/50 transition-colors opacity-0 group-hover/breadcrumb:opacity-100"
                >
                  <X weight="bold" className="h-3 w-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Close table</TooltipContent>
            </Tooltip>
          </>
        )}
        {pageId && (
          <>
            <span className="px-1 py-0.5 text-sm text-foreground bg-transparent rounded-sm">
              {currentPage?.title || pageId}
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleClose}
                  className="ml-1 p-0.5 rounded-sm text-muted-foreground/70 hover:text-muted-foreground hover:bg-accent/50 transition-colors opacity-0 group-hover/breadcrumb:opacity-100"
                >
                  <X weight="bold" className="h-3 w-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Close page</TooltipContent>
            </Tooltip>
          </>
        )}
        {actionId && (
          <>
            <span className="px-1 py-0.5 text-sm text-foreground bg-transparent rounded-sm">
              {currentAction?.name || actionId}
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleClose}
                  className="ml-1 p-0.5 rounded-sm text-muted-foreground/70 hover:text-muted-foreground hover:bg-accent/50 transition-colors opacity-0 group-hover/breadcrumb:opacity-100"
                >
                  <X weight="bold" className="h-3 w-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Close action</TooltipContent>
            </Tooltip>
          </>
        )}
      </div>

      {/* Right: Actions */}
      <HeaderActions
        rightPanel={rightPanel}
        toggleRightPanel={toggleRightPanel}
        isConnecting={isConnecting}
        runtimePort={runtimePort}
        isDbLoading={isDbLoading}
        runtimeConnected={runtimeConnected}
        alertCount={alertCount}
        alertErrors={alertErrors}
        alertWarnings={alertWarnings}
        tunnelUrl={tunnelUrl}
        tunnelStatus={tunnelStatus}
        tunnelError={tunnelError}
      />
    </header>
  );
}

// ============================================================================
// Header Actions (right side buttons)
// ============================================================================

interface HeaderActionsProps {
  rightPanel: RightPanelId;
  toggleRightPanel: (panel: Exclude<RightPanelId, null>) => void;
  isConnecting: boolean;
  runtimePort: number | null;
  isDbLoading: boolean;
  runtimeConnected: boolean;
  alertCount: number;
  alertErrors: number;
  alertWarnings: number;
  tunnelUrl: string | null;
  tunnelStatus: "connecting" | "connected" | "error";
  tunnelError: string | null;
}

function HeaderActions({
  rightPanel,
  toggleRightPanel,
  isConnecting,
  runtimePort,
  isDbLoading,
  runtimeConnected,
  alertCount,
  alertErrors,
  alertWarnings,
  tunnelUrl,
  tunnelStatus,
  tunnelError,
}: HeaderActionsProps) {
  return (
    <div className="flex items-center gap-1">
      {/* Loading shimmer when connecting */}
      {isConnecting && (
        <div className="flex items-center gap-1 px-2 py-1">
          <div className="h-4 w-8 bg-muted/50 rounded animate-pulse" />
          <div className="h-4 w-8 bg-muted/50 rounded animate-pulse" />
        </div>
      )}

      {/* Database button */}
      {!isConnecting && runtimePort && (
        <DatabaseButton
          rightPanel={rightPanel}
          toggleRightPanel={toggleRightPanel}
          isDbLoading={isDbLoading}
        />
      )}

      {/* Alerts button */}
      {!isConnecting && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => toggleRightPanel("alerts")}
              className={cn(
                "flex items-center gap-1 px-1.5 py-1 rounded-md text-[11px] transition-colors",
                rightPanel === "alerts"
                  ? "bg-accent text-foreground"
                  : !runtimeConnected
                  ? "text-muted-foreground/70 hover:bg-accent/50 hover:text-muted-foreground"
                  : alertCount > 0
                  ? "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              )}
            >
              <Warning
                weight="duotone"
                className={cn(
                  "h-3.5 w-3.5",
                  !runtimeConnected
                    ? ""
                    : alertErrors > 0
                    ? "text-red-500"
                    : alertWarnings > 0
                    ? "text-yellow-500"
                    : ""
                )}
              />
              {runtimeConnected ? (
                <span
                  className={cn(
                    "tabular-nums",
                    alertErrors > 0
                      ? "text-red-500"
                      : alertWarnings > 0
                      ? "text-yellow-500"
                      : "text-muted-foreground/70"
                  )}
                >
                  {alertCount}
                </span>
              ) : (
                <span className="text-muted-foreground/70">—</span>
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {!runtimeConnected
              ? "Runtime (not connected)"
              : alertCount > 0
              ? "Alerts"
              : "All clear"}
          </TooltipContent>
        </Tooltip>
      )}

      {/* Settings button */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={() => toggleRightPanel("settings")}
            className={cn(
              "flex items-center justify-center w-6 h-6 rounded-md transition-colors",
              rightPanel === "settings"
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            )}
          >
            <Gear weight="duotone" className="h-4 w-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Settings</TooltipContent>
      </Tooltip>

      {/* Separator */}
      <div className="w-px h-4 bg-border mx-0.5" />

      {/* Share button with popover */}
      <Popover>
        <PopoverTrigger asChild>
          <button
            className={cn(
              "px-2 py-1 rounded-md text-[12px] font-medium transition-colors",
              tunnelUrl
                ? "text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10"
                : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
            )}
          >
            {tunnelUrl ? (
              <span className="flex items-center gap-1">
                <Globe weight="duotone" className="h-3.5 w-3.5" />
                Live
              </span>
            ) : (
              "Share"
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 p-0">
          <Tabs defaultValue="preview">
            <TabsList className="h-9 px-2 border-b">
              <TabsTrigger value="preview" className="text-xs">
                Preview
              </TabsTrigger>
            </TabsList>
            <TabsContent value="preview" className="mt-0 p-3">
              <div className="space-y-3">
                {runtimePort ? (
                  <>
                    <div>
                      <div className="text-sm font-medium mb-1">
                        {tunnelUrl ? "Public link" : "Local preview"}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {tunnelUrl
                          ? "Anyone with the link can view this workbook"
                          : "Preview on your local network"}
                      </p>
                    </div>

                    {(() => {
                      const previewUrl =
                        tunnelUrl || `http://localhost:${runtimePort}`;
                      return (
                        <div className="flex items-center gap-2">
                          <div className="flex-1 px-2 py-1.5 text-xs font-mono bg-muted rounded-md truncate">
                            {previewUrl.replace(/^https?:\/\//, "")}
                          </div>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(previewUrl);
                                }}
                                className="p-1.5 rounded-md hover:bg-accent transition-colors"
                              >
                                <Copy
                                  weight="duotone"
                                  className="h-3.5 w-3.5 text-muted-foreground"
                                />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>Copy link</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                onClick={() => {
                                  window.open(previewUrl, "_blank");
                                }}
                                className="p-1.5 rounded-md hover:bg-accent transition-colors"
                              >
                                <ArrowSquareOut
                                  weight="duotone"
                                  className="h-3.5 w-3.5 text-muted-foreground"
                                />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>Open in browser</TooltipContent>
                          </Tooltip>
                        </div>
                      );
                    })()}

                    {/* Tunnel status */}
                    {tunnelUrl ? (
                      <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                        <Globe weight="duotone" className="h-3 w-3" />
                        <span>Public via Cloudflare Tunnel</span>
                      </div>
                    ) : tunnelStatus === "connecting" ? (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <CircleNotch className="h-3 w-3 animate-spin" />
                        <span>Connecting tunnel...</span>
                      </div>
                    ) : tunnelError ? (
                      <div className="px-2 py-1.5 text-xs text-amber-600 dark:text-amber-400 bg-amber-500/10 rounded-md">
                        {tunnelError.includes("ENOENT")
                          ? "For public sharing: brew install cloudflared"
                          : tunnelError}
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="text-xs text-muted-foreground">
                    Start the runtime to preview your workbook
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </PopoverContent>
      </Popover>
    </div>
  );
}

// ============================================================================
// Database Button (extracted for tRPC dependency)
// ============================================================================

function DatabaseButton({
  rightPanel,
  toggleRightPanel,
  isDbLoading,
}: {
  rightPanel: RightPanelId;
  toggleRightPanel: (panel: Exclude<RightPanelId, null>) => void;
  isDbLoading: boolean;
}) {
  const database = useDatabase();
  const dbConnected = database.isReady;
  const tableCount = database.tableCount;

  return (
    <HoverCard openDelay={0} closeDelay={100}>
      <HoverCardTrigger asChild>
        <button
          onClick={() => toggleRightPanel("database")}
          className={cn(
            "flex items-center gap-1 px-1.5 py-1 rounded-md text-[11px] transition-colors",
            rightPanel === "database"
              ? "bg-accent text-foreground"
              : dbConnected && tableCount > 0
              ? "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              : "text-muted-foreground/70 hover:bg-accent/50 hover:text-muted-foreground"
          )}
        >
          <Database
            weight="duotone"
            className={cn(
              "h-3.5 w-3.5",
              !isDbLoading && dbConnected && tableCount > 0 && "text-blue-500"
            )}
          />
          {isDbLoading ? (
            <div className="w-4 h-3 bg-muted/50 rounded animate-pulse" />
          ) : (
            <span
              className={cn(
                "tabular-nums",
                dbConnected && tableCount > 0
                  ? "text-foreground"
                  : "text-muted-foreground/70"
              )}
            >
              {tableCount}
            </span>
          )}
        </button>
      </HoverCardTrigger>
      <HoverCardContent side="bottom" align="center" className="w-auto p-1">
        <div className="flex items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground">
          <Database weight="duotone" className="h-3 w-3" />
          <span>
            {tableCount} table{tableCount !== 1 ? "s" : ""}
          </span>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
