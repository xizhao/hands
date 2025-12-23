/**
 * ActionDetailPanel - Shows action details, run history, and allows manual execution
 *
 * Features:
 * - Action metadata (name, description, triggers, schedule)
 * - "Run Now" button for manual execution
 * - Run history table with expandable rows
 * - Live status for running actions
 */

import { Check, CircleNotch, Clock, Code, Globe, Play, Warning, X } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useRuntimePort } from "@/hooks/useRuntimeState";
import { cn } from "@/lib/utils";

interface ActionDetailPanelProps {
  actionId: string;
}

interface ActionRun {
  id: string;
  actionId: string;
  trigger: "manual" | "cron" | "webhook" | "pg_notify";
  status: "running" | "success" | "failed";
  input: unknown;
  output?: unknown;
  error?: string;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
}

interface ActionStats {
  totalRuns: number;
  successCount: number;
  failedCount: number;
  averageDurationMs: number | null;
  lastRunAt: string | null;
}

interface SchemaColumn {
  name: string;
  type: string;
  optional?: boolean;
}

interface SchemaTable {
  name: string;
  columns: SchemaColumn[];
  primaryKey?: string[];
}

interface ActionSchema {
  tables: SchemaTable[];
}

interface DiscoveredAction {
  id: string;
  path: string;
  name: string;
  description?: string;
  schedule?: string;
  triggers: Array<"manual" | "webhook" | "pg_notify">;
  hasWebhook: boolean;
  webhookPath?: string;
  pgNotifyChannel?: string;
  secrets?: string[];
  missingSecrets?: string[];
  hasInput: boolean;
  inputSchema?: { description?: string };
  schema?: ActionSchema;
  nextRun?: string;
  lastRun?: ActionRun;
}

export function ActionDetailPanel({ actionId }: ActionDetailPanelProps) {
  const port = useRuntimePort();
  const queryClient = useQueryClient();
  const [expandedRuns, setExpandedRuns] = useState<Set<string>>(new Set());

  // Fetch action details
  const { data: action, isLoading: actionLoading } = useQuery({
    queryKey: ["action", actionId, port],
    queryFn: async (): Promise<DiscoveredAction | null> => {
      if (!port) return null;
      const res = await fetch(
        `http://localhost:${port}/trpc/actions.get?input=${encodeURIComponent(JSON.stringify({ id: actionId }))}`,
      );
      if (!res.ok) return null;
      const json = await res.json();
      return json.result?.data ?? null;
    },
    enabled: !!port && !!actionId,
  });

  // Fetch action stats
  const { data: stats } = useQuery({
    queryKey: ["action-stats", actionId, port],
    queryFn: async (): Promise<ActionStats | null> => {
      if (!port) return null;
      const res = await fetch(
        `http://localhost:${port}/trpc/actions.stats?input=${encodeURIComponent(JSON.stringify({ actionId }))}`,
      );
      if (!res.ok) return null;
      const json = await res.json();
      return json.result?.data ?? null;
    },
    enabled: !!port && !!actionId,
  });

  // Fetch run history
  const { data: runs, isLoading: runsLoading } = useQuery({
    queryKey: ["action-runs", actionId, port],
    queryFn: async (): Promise<ActionRun[]> => {
      if (!port) return [];
      const res = await fetch(
        `http://localhost:${port}/trpc/actions.runs?input=${encodeURIComponent(JSON.stringify({ actionId, limit: 50 }))}`,
      );
      if (!res.ok) return [];
      const json = await res.json();
      return json.result?.data ?? [];
    },
    enabled: !!port && !!actionId,
    refetchInterval: 5000, // Poll for updates while runs may be in progress
  });

  // Run action mutation
  const runMutation = useMutation({
    mutationFn: async () => {
      if (!port) throw new Error("Runtime not connected");
      const res = await fetch(`http://localhost:${port}/trpc/actions.run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: actionId }),
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(err || "Failed to run action");
      }
      const json = await res.json();
      return json.result?.data;
    },
    onSuccess: () => {
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ["action-runs", actionId] });
      queryClient.invalidateQueries({ queryKey: ["action-stats", actionId] });
      queryClient.invalidateQueries({ queryKey: ["action", actionId] });
    },
  });

  const toggleRunExpanded = (runId: string) => {
    setExpandedRuns((prev) => {
      const next = new Set(prev);
      if (next.has(runId)) {
        next.delete(runId);
      } else {
        next.add(runId);
      }
      return next;
    });
  };

  if (!port) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        <p>Runtime not connected</p>
      </div>
    );
  }

  if (actionLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <CircleNotch weight="bold" className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!action) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        <p>Action not found</p>
      </div>
    );
  }

  const hasWebhookTrigger = action.hasWebhook;
  const webhookUrl = hasWebhookTrigger ? `http://localhost:${port}/webhook/${actionId}` : null;

  return (
    <TooltipProvider delayDuration={0}>
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-border space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-semibold truncate">{action.name}</h1>
              {action.description && (
                <p className="text-sm text-muted-foreground mt-0.5">
                  {action.description}
                </p>
              )}
            </div>
            <Button
              onClick={() => runMutation.mutate()}
              disabled={runMutation.isPending}
              size="xs"
              className="gap-1.5"
            >
              {runMutation.isPending ? (
                <CircleNotch weight="bold" className="h-4 w-4 animate-spin" />
              ) : (
                <Play weight="fill" className="h-4 w-4" />
              )}
              Run Now
            </Button>
          </div>

          {/* Triggers & Schedule */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {action.schedule && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-muted text-muted-foreground">
                    <Clock weight="duotone" className="h-3.5 w-3.5" />
                    <span>{action.schedule}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Cron schedule</p>
                  {action.nextRun && (
                    <p className="text-xs text-muted-foreground">
                      Next: {formatDistanceToNow(new Date(action.nextRun), { addSuffix: true })}
                    </p>
                  )}
                </TooltipContent>
              </Tooltip>
            )}
            {hasWebhookTrigger && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-muted text-muted-foreground">
                    <Globe weight="duotone" className="h-3.5 w-3.5" />
                    <span>Webhook</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="font-mono text-xs">{webhookUrl}</p>
                </TooltipContent>
              </Tooltip>
            )}
            <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-muted text-muted-foreground">
              <Play weight="fill" className="h-3.5 w-3.5" />
              <span>Manual</span>
            </div>
          </div>

          {/* Webhook URL */}
          {webhookUrl && (
            <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50 border border-border">
              <Globe weight="duotone" className="h-4 w-4 text-muted-foreground shrink-0" />
              <code className="flex-1 text-xs truncate font-mono">{webhookUrl}</code>
              <button
                onClick={() => navigator.clipboard.writeText(webhookUrl)}
                className="p-1 rounded hover:bg-accent transition-colors"
              >
                <Code weight="bold" className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Stats */}
          {stats && stats.totalRuns > 0 && (
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span>{stats.totalRuns} runs</span>
              <span className="text-green-500">{stats.successCount} succeeded</span>
              {stats.failedCount > 0 && (
                <span className="text-red-500">{stats.failedCount} failed</span>
              )}
              {stats.averageDurationMs !== null && (
                <span>Avg: {Math.round(stats.averageDurationMs)}ms</span>
              )}
            </div>
          )}

          {/* Schema Requirements */}
          {action.schema && action.schema.tables.length > 0 && (
            <div className="pt-2">
              <p className="text-xs font-medium text-muted-foreground mb-2">
                Schema Requirements
              </p>
              <div className="space-y-2">
                {action.schema.tables.map((table) => (
                  <div
                    key={table.name}
                    className="text-xs bg-muted/50 rounded-md p-2 border border-border"
                  >
                    <div className="font-medium font-mono">{table.name}</div>
                    <div className="mt-1 text-muted-foreground space-x-1">
                      {table.columns.slice(0, 5).map((col) => (
                        <span
                          key={col.name}
                          className={cn(
                            "inline-block px-1.5 py-0.5 rounded bg-muted",
                            col.optional && "opacity-60",
                          )}
                        >
                          {col.name}
                          {col.optional && "?"}
                        </span>
                      ))}
                      {table.columns.length > 5 && (
                        <span className="text-muted-foreground/60">
                          +{table.columns.length - 5} more
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Run History */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="px-4 py-2 border-b border-border">
            <h2 className="text-sm font-medium">Run History</h2>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-2">
              {runsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <CircleNotch
                    weight="bold"
                    className="h-5 w-5 animate-spin text-muted-foreground"
                  />
                </div>
              ) : runs && runs.length > 0 ? (
                runs.map((run) => {
                  const isExpanded = expandedRuns.has(run.id);
                  return (
                    <div
                      key={run.id}
                      className="rounded-lg border border-border bg-card overflow-hidden"
                    >
                      <button
                        onClick={() => toggleRunExpanded(run.id)}
                        className="w-full flex items-center gap-3 p-3 hover:bg-accent/50 transition-colors text-left"
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 shrink-0" />
                        ) : (
                          <ChevronRight className="h-4 w-4 shrink-0" />
                        )}
                        <RunStatusIcon status={run.status} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">
                              {formatDistanceToNow(new Date(run.startedAt), { addSuffix: true })}
                            </span>
                            <span
                              className={cn(
                                "text-xs px-1.5 py-0.5 rounded",
                                run.trigger === "manual" && "bg-blue-500/10 text-blue-500",
                                run.trigger === "cron" && "bg-purple-500/10 text-purple-500",
                                run.trigger === "webhook" && "bg-amber-500/10 text-amber-500",
                              )}
                            >
                              {run.trigger}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {run.durationMs !== undefined && <span>{run.durationMs}ms</span>}
                            {run.status === "running" && <span>In progress...</span>}
                          </div>
                        </div>
                      </button>
                      {isExpanded && (
                        <div className="border-t border-border p-3 space-y-3 bg-muted/30">
                          {run.error && (
                            <div className="p-2 rounded bg-red-500/10 border border-red-500/20">
                              <p className="text-xs font-medium text-red-500 mb-1">Error</p>
                              <pre className="text-xs text-red-400 whitespace-pre-wrap font-mono">
                                {run.error}
                              </pre>
                            </div>
                          )}
                          {run.input !== undefined && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-1">
                                Input
                              </p>
                              <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-32 font-mono">
                                {JSON.stringify(run.input, null, 2)}
                              </pre>
                            </div>
                          )}
                          {run.output !== undefined && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-1">
                                Output
                              </p>
                              <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-32 font-mono">
                                {JSON.stringify(run.output, null, 2)}
                              </pre>
                            </div>
                          )}
                          <div className="text-xs text-muted-foreground">
                            <span className="font-mono">{run.id}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Play weight="duotone" className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No runs yet</p>
                  <p className="text-xs mt-1">Click "Run Now" to execute this action</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>
    </TooltipProvider>
  );
}

function RunStatusIcon({ status }: { status: ActionRun["status"] }) {
  switch (status) {
    case "running":
      return <CircleNotch weight="bold" className="h-4 w-4 animate-spin text-blue-500" />;
    case "success":
      return <Check weight="bold" className="h-4 w-4 text-green-500" />;
    case "failed":
      return <X weight="bold" className="h-4 w-4 text-red-500" />;
  }
}
