/**
 * Actions Index Route - /actions
 *
 * Lists all discovered actions with their status, triggers, and last run info.
 * Provides navigation to individual action detail pages.
 */

import { CircleNotch, Clock, Database, Globe, Play, Warning } from "@phosphor-icons/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useRuntimePort } from "@/hooks/useRuntimeState";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_notebook/actions/")({
  component: ActionsIndexPage,
});

interface ActionListItem {
  id: string;
  name: string;
  description?: string;
  schedule?: string;
  triggers: Array<"manual" | "webhook" | "pg_notify">;
  hasWebhook: boolean;
  hasInput: boolean;
  hasSchema: boolean;
  missingSecrets?: string[];
  nextRun?: string;
  lastRun?: {
    id: string;
    status: "running" | "success" | "failed";
    startedAt: string;
    durationMs?: number;
  };
}

function ActionsIndexPage() {
  const port = useRuntimePort();
  const queryClient = useQueryClient();
  const [runningActionId, setRunningActionId] = useState<string | null>(null);

  // Fetch all actions
  const { data: actions, isLoading } = useQuery({
    queryKey: ["actions", port],
    queryFn: async (): Promise<ActionListItem[]> => {
      if (!port) return [];
      const res = await fetch(`http://localhost:${port}/trpc/actions.list`);
      if (!res.ok) return [];
      const json = await res.json();
      return json.result?.data ?? [];
    },
    enabled: !!port,
    refetchInterval: 10000, // Poll for updates
  });

  // Run action mutation
  const runMutation = useMutation({
    mutationFn: async (actionId: string) => {
      if (!port) throw new Error("Runtime not connected");
      setRunningActionId(actionId);
      const res = await fetch(`http://localhost:${port}/trpc/actions.run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: actionId }),
      });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      return res.json();
    },
    onSettled: () => {
      setRunningActionId(null);
      queryClient.invalidateQueries({ queryKey: ["actions"] });
    },
  });

  if (!port) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        <p>Waiting for runtime...</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <CircleNotch weight="bold" className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={0}>
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">Actions</h1>
            <p className="text-sm text-muted-foreground">
              {actions?.length ?? 0} action{(actions?.length ?? 0) !== 1 ? "s" : ""}
            </p>
          </div>
        </div>

        {/* Actions List */}
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-2">
            {actions && actions.length > 0 ? (
              actions.map((action) => {
                const isRunning = runningActionId === action.id;
                const hasMissingSecrets = (action.missingSecrets?.length ?? 0) > 0;

                return (
                  <div
                    key={action.id}
                    className="group flex items-center gap-3 p-3 rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors"
                  >
                    {/* Action Info */}
                    <Link
                      to="/actions/$actionId"
                      params={{ actionId: action.id }}
                      className="flex-1 min-w-0"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{action.name}</span>
                        {hasMissingSecrets && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Warning weight="fill" className="h-4 w-4 text-amber-500 shrink-0" />
                            </TooltipTrigger>
                            <TooltipContent>
                              Missing secrets: {action.missingSecrets?.join(", ")}
                            </TooltipContent>
                          </Tooltip>
                        )}
                        {action.hasSchema && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Database weight="duotone" className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            </TooltipTrigger>
                            <TooltipContent>Has schema requirements</TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                      {action.description && (
                        <p className="text-sm text-muted-foreground truncate mt-0.5">
                          {action.description}
                        </p>
                      )}
                    </Link>

                    {/* Triggers */}
                    <div className="flex items-center gap-1 text-muted-foreground/60">
                      {action.schedule && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span>
                              <Clock weight="duotone" className="h-4 w-4" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>Schedule: {action.schedule}</TooltipContent>
                        </Tooltip>
                      )}
                      {action.hasWebhook && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span>
                              <Globe weight="duotone" className="h-4 w-4" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>Webhook trigger</TooltipContent>
                        </Tooltip>
                      )}
                    </div>

                    {/* Last Run Status */}
                    {action.lastRun && (
                      <div
                        className={cn(
                          "text-xs px-2 py-0.5 rounded",
                          action.lastRun.status === "success" && "bg-green-500/10 text-green-500",
                          action.lastRun.status === "failed" && "bg-red-500/10 text-red-500",
                          action.lastRun.status === "running" && "bg-blue-500/10 text-blue-500",
                        )}
                      >
                        {action.lastRun.status === "running"
                          ? "Running"
                          : formatDistanceToNow(new Date(action.lastRun.startedAt), {
                              addSuffix: true,
                            })}
                      </div>
                    )}

                    {/* Run Button */}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => {
                        e.preventDefault();
                        runMutation.mutate(action.id);
                      }}
                      disabled={isRunning || hasMissingSecrets}
                    >
                      {isRunning ? (
                        <CircleNotch weight="bold" className="h-4 w-4 animate-spin text-green-500" />
                      ) : (
                        <Play weight="fill" className="h-4 w-4 text-green-500" />
                      )}
                    </Button>
                  </div>
                );
              })
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Play weight="duotone" className="h-12 w-12 mx-auto mb-4 opacity-30" />
                <p className="text-sm font-medium">No actions yet</p>
                <p className="text-xs mt-1">
                  Create actions in the <code className="bg-muted px-1 rounded">actions/</code>{" "}
                  directory
                </p>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </TooltipProvider>
  );
}
