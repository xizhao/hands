/**
 * ActionDetailPanel - Shows action details and allows manual execution
 *
 * Features:
 * - Action metadata (name, description, triggers, schedule)
 * - Visual data lineage graph (React Flow)
 * - Code view for action source
 * - "Run Now" button for manual execution
 */

import { CircleNotch, Clock, Code, Globe, Play } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ActionEditor } from "@hands/editor";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useRuntimePort } from "@/hooks/useRuntimeState";
import { cn } from "@/lib/utils";

interface ActionDetailPanelProps {
  actionId: string;
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
}

export function ActionDetailPanel({ actionId }: ActionDetailPanelProps) {
  const port = useRuntimePort();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

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

  // Fetch action source code
  const { data: sourceData } = useQuery({
    queryKey: ["action-source", actionId, port],
    queryFn: async (): Promise<{ source: string; path: string } | null> => {
      if (!port) return null;
      const res = await fetch(
        `http://localhost:${port}/trpc/actions.source?input=${encodeURIComponent(JSON.stringify({ id: actionId }))}`,
      );
      if (!res.ok) return null;
      const json = await res.json();
      return json.result?.data ?? null;
    },
    enabled: !!port && !!actionId,
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
      queryClient.invalidateQueries({ queryKey: ["action", actionId] });
    },
  });

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

        {/* Editor */}
        <div className="flex-1 flex flex-col min-h-0">
          {sourceData?.source ? (
            <ActionEditor
              actionId={actionId}
              name={action.name}
              source={sourceData.source}
              className="h-full"
              onTableClick={(table) => navigate({ to: "/tables/$tableId", params: { tableId: table } })}
              runtimePort={port}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <CircleNotch weight="bold" className="h-6 w-6 animate-spin" />
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
