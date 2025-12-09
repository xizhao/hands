/**
 * LiveIndicator - Status dropdown showing Local/Production environment status
 *
 * Shows a colored dot indicating overall status and a dropdown with:
 * - PostgreSQL connection status
 * - Dev Server (Worker) status
 * - OpenCode AI server status
 * - API routes
 * - TypeScript diagnostics
 */

import { invoke } from "@tauri-apps/api/core";
import { useUIStore } from "@/stores/ui";
import { useServer } from "@/hooks/useServer";
import {
  useDevServerStatus,
  useDevServerRoutes,
  useWorkbookDatabase,
  useEvalResult,
  useRuntimeEval,
} from "@/hooks/useWorkbook";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import {
  Database,
  Radio,
  Cpu,
  Route as RouteIcon,
  ExternalLink,
  AlertCircle,
  AlertTriangle,
  FileCode,
  Sparkles,
  RotateCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

export function LiveIndicator() {
  const { activeWorkbookId } = useUIStore();
  const { isConnected, isConnecting, isRestarting, restartServer } = useServer();

  // Dev server and eval data
  const { data: devServerStatus } = useDevServerStatus(activeWorkbookId);
  const { data: devServerRoutes } = useDevServerRoutes(activeWorkbookId);
  const { data: workbookDatabase } = useWorkbookDatabase(activeWorkbookId);
  const { data: evalResult } = useEvalResult(activeWorkbookId);
  const runtimeEval = useRuntimeEval();

  // Compute diagnostics counts
  const tsErrors = evalResult?.typescript?.errors?.length ?? 0;
  const tsWarnings = evalResult?.typescript?.warnings?.length ?? 0;
  const formatErrors = evalResult?.format?.errors?.length ?? 0;
  const unusedCount =
    (evalResult?.unused?.exports?.length ?? 0) +
    (evalResult?.unused?.files?.length ?? 0);
  const hasIssues =
    tsErrors > 0 || tsWarnings > 0 || formatErrors > 0 || unusedCount > 0;

  // Overall status color
  const getStatusColor = () => {
    if (tsErrors > 0) return "bg-red-500";
    if (tsWarnings > 0 || unusedCount > 0) return "bg-yellow-500";
    if (devServerStatus?.running) return "bg-green-500";
    return "bg-zinc-500";
  };

  // Open a URL in a webview window
  const openInWebview = async (url: string, title?: string) => {
    try {
      await invoke("open_webview", { url, title });
    } catch (err) {
      console.error("Failed to open webview:", err);
    }
  };

  // Build URL for a route
  const getRouteUrl = (path: string) => {
    const baseUrl = devServerRoutes?.url || "http://localhost:8787";
    return `${baseUrl}${path}`;
  };

  // Always show a dot, even if no workbook is active (gray/offline state)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center justify-center w-5 h-5 rounded hover:bg-accent/50 transition-colors">
          <span
            className={cn(
              "inline-flex rounded-full h-1.5 w-1.5",
              activeWorkbookId ? getStatusColor() : "bg-zinc-500"
            )}
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72 p-0">
        {/* Tabs */}
        <div className="flex border-b border-border">
          <button className="flex-1 px-3 py-2 text-sm font-medium text-foreground border-b-2 border-primary flex items-center justify-center gap-1.5">
            <span
              className={cn(
                "inline-flex rounded-full h-1.5 w-1.5",
                devServerStatus?.running ? "bg-green-500" : "bg-zinc-500"
              )}
            />
            Local
          </button>
          <button className="flex-1 px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-not-allowed">
            Production
            <span className="ml-1 text-[10px] text-muted-foreground/60">
              soon
            </span>
          </button>
        </div>

        {/* Local content */}
        <div className="p-1">
          {/* PostgreSQL Status */}
          <div className="px-2 py-2">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-blue-400" />
              <div className="flex-1">
                <div className="text-sm font-medium">PostgreSQL</div>
                <div className="text-xs text-muted-foreground">
                  {devServerStatus?.running && devServerStatus?.postgres_port
                    ? `${workbookDatabase?.database_name || "database"} on port ${devServerStatus.postgres_port}`
                    : devServerStatus?.postgres_port
                      ? `Starting on port ${devServerStatus.postgres_port}...`
                      : "Connecting..."}
                </div>
              </div>
              <button
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onClick={async (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const runtimePort = devServerStatus?.runtime_port;
                  if (runtimePort && activeWorkbookId) {
                    try {
                      await invoke("open_db_browser", {
                        runtimePort,
                        workbookId: activeWorkbookId,
                      });
                    } catch (err) {
                      console.error("Failed to open DB browser:", err);
                    }
                  }
                }}
                disabled={!devServerStatus?.runtime_port}
                className="px-2 py-1 text-xs bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-200 rounded transition-colors"
              >
                Browse
              </button>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (activeWorkbookId) {
                    runtimeEval.mutate(activeWorkbookId);
                  }
                }}
                disabled={runtimeEval.isPending}
                className={cn(
                  "p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors",
                  runtimeEval.isPending && "opacity-50 cursor-not-allowed"
                )}
                title="Refresh runtime status"
              >
                <RotateCw
                  className={cn(
                    "h-3 w-3",
                    runtimeEval.isPending && "animate-spin"
                  )}
                />
              </button>
              <span
                className={cn(
                  "inline-flex rounded-full h-2 w-2",
                  devServerStatus?.running && devServerStatus?.postgres_port
                    ? "bg-green-500"
                    : devServerStatus?.postgres_port
                      ? "bg-yellow-500 animate-pulse"
                      : "bg-zinc-500"
                )}
              />
            </div>
          </div>

          <DropdownMenuSeparator />

          {/* Dev Server (Worker) Status */}
          <div className="px-2 py-2">
            <div className="flex items-center gap-2">
              <Radio className="h-4 w-4 text-purple-400" />
              <div className="flex-1">
                <div className="text-sm font-medium">Dev Server</div>
                <div className="text-xs text-muted-foreground">
                  {devServerStatus?.running && devServerStatus?.worker_port
                    ? `http://localhost:${devServerStatus.worker_port}`
                    : devServerStatus?.worker_port
                      ? `Starting on port ${devServerStatus.worker_port}...`
                      : "Not running"}
                </div>
              </div>
              <span
                className={cn(
                  "inline-flex rounded-full h-2 w-2",
                  devServerStatus?.running && devServerStatus?.worker_port
                    ? "bg-green-500"
                    : devServerStatus?.worker_port
                      ? "bg-yellow-500 animate-pulse"
                      : "bg-zinc-500"
                )}
              />
            </div>
          </div>

          <DropdownMenuSeparator />

          {/* OpenCode AI Server Status */}
          <div className="px-2 py-2">
            <div className="flex items-center gap-2">
              <Cpu className="h-4 w-4 text-orange-400" />
              <div className="flex-1">
                <div className="text-sm font-medium">OpenCode</div>
                <div className="text-xs text-muted-foreground">
                  {isRestarting
                    ? "Restarting..."
                    : isConnecting
                      ? "Connecting..."
                      : isConnected
                        ? "http://localhost:4096"
                        : "Disconnected"}
                </div>
              </div>
              <span
                className={cn(
                  "inline-flex rounded-full h-2 w-2",
                  isRestarting || isConnecting
                    ? "bg-yellow-500 animate-pulse"
                    : isConnected
                      ? "bg-green-500"
                      : "bg-red-500"
                )}
              />
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  restartServer();
                }}
                disabled={isRestarting}
                className={cn(
                  "p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors",
                  isRestarting && "opacity-50 cursor-not-allowed"
                )}
                title="Restart OpenCode server"
              >
                <RotateCw
                  className={cn("h-3 w-3", isRestarting && "animate-spin")}
                />
              </button>
            </div>
          </div>

          {/* API Routes submenu */}
          {devServerRoutes?.routes && devServerRoutes.routes.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="flex items-center gap-2">
                  <RouteIcon className="h-4 w-4 text-blue-400" />
                  <span>API Routes</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {devServerRoutes.routes.length}
                  </span>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-64 max-h-80 overflow-y-auto">
                  {devServerRoutes.routes.map((route, i) => (
                    <DropdownMenuItem
                      key={i}
                      onClick={() =>
                        openInWebview(
                          getRouteUrl(route.path),
                          `${route.method} ${route.path}`
                        )
                      }
                      className="flex items-center gap-2 font-mono text-xs"
                    >
                      <span
                        className={cn(
                          "text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0",
                          route.method === "GET" &&
                            "bg-green-500/20 text-green-400",
                          route.method === "POST" &&
                            "bg-blue-500/20 text-blue-400",
                          route.method === "PUT" &&
                            "bg-yellow-500/20 text-yellow-400",
                          route.method === "DELETE" &&
                            "bg-red-500/20 text-red-400",
                          route.method === "PATCH" &&
                            "bg-purple-500/20 text-purple-400"
                        )}
                      >
                        {route.method}
                      </span>
                      <span className="flex-1 truncate">{route.path}</span>
                      <ExternalLink className="h-3 w-3 opacity-50 shrink-0" />
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </>
          )}

          {/* Diagnostics section */}
          {hasIssues && (
            <>
              <DropdownMenuSeparator />
              <div className="px-2 py-1.5">
                <div className="text-xs font-medium text-muted-foreground mb-1.5">
                  Code Quality
                </div>

                {/* TypeScript Errors */}
                {tsErrors > 0 && (
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger className="flex items-center gap-2 text-red-400">
                      <AlertCircle className="h-3.5 w-3.5" />
                      <span className="text-sm">
                        {tsErrors} error{tsErrors !== 1 ? "s" : ""}
                      </span>
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="w-80 max-h-64 overflow-y-auto">
                      {evalResult?.typescript?.errors?.map((diag, i) => (
                        <div
                          key={i}
                          className="px-2 py-1.5 text-xs border-b border-border/50 last:border-0"
                        >
                          <div className="font-mono text-muted-foreground truncate">
                            {diag.file}:{diag.line}:{diag.column}
                          </div>
                          <div className="text-red-400 mt-0.5">
                            {diag.message}
                          </div>
                          {diag.code && (
                            <div className="text-muted-foreground/60 mt-0.5">
                              {diag.code}
                            </div>
                          )}
                        </div>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                )}

                {/* TypeScript Warnings */}
                {tsWarnings > 0 && (
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger className="flex items-center gap-2 text-yellow-400">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      <span className="text-sm">
                        {tsWarnings} warning{tsWarnings !== 1 ? "s" : ""}
                      </span>
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="w-80 max-h-64 overflow-y-auto">
                      {evalResult?.typescript?.warnings?.map((diag, i) => (
                        <div
                          key={i}
                          className="px-2 py-1.5 text-xs border-b border-border/50 last:border-0"
                        >
                          <div className="font-mono text-muted-foreground truncate">
                            {diag.file}:{diag.line}:{diag.column}
                          </div>
                          <div className="text-yellow-400 mt-0.5">
                            {diag.message}
                          </div>
                          {diag.code && (
                            <div className="text-muted-foreground/60 mt-0.5">
                              {diag.code}
                            </div>
                          )}
                        </div>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                )}

                {/* Unused Code */}
                {unusedCount > 0 && (
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger className="flex items-center gap-2 text-muted-foreground">
                      <FileCode className="h-3.5 w-3.5" />
                      <span className="text-sm">{unusedCount} unused</span>
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="w-64 max-h-64 overflow-y-auto">
                      {evalResult?.unused?.files?.map((file, i) => (
                        <div
                          key={`file-${i}`}
                          className="px-2 py-1 text-xs font-mono text-muted-foreground"
                        >
                          <span className="text-yellow-400/60">file:</span>{" "}
                          {file}
                        </div>
                      ))}
                      {evalResult?.unused?.exports?.map((exp, i) => (
                        <div
                          key={`exp-${i}`}
                          className="px-2 py-1 text-xs font-mono text-muted-foreground"
                        >
                          <span className="text-blue-400/60">export:</span>{" "}
                          {exp}
                        </div>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                )}
              </div>
            </>
          )}

          {/* All clear indicator */}
          {!hasIssues && evalResult && (
            <>
              <DropdownMenuSeparator />
              <div className="px-2 py-2 flex items-center gap-2 text-green-400">
                <Sparkles className="h-4 w-4" />
                <span className="text-sm">No issues</span>
              </div>
            </>
          )}

          {/* Open dev server in browser */}
          {devServerStatus?.running && devServerRoutes?.url && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => openInWebview(devServerRoutes.url, "Dev Server")}
                className="flex items-center gap-2"
              >
                <ExternalLink className="h-4 w-4" />
                <span>Open in Preview</span>
              </DropdownMenuItem>
            </>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
