/**
 * ActionDetailPanel - Shows action details and allows manual execution
 *
 * Features:
 * - Action metadata (name, description, triggers, schedule)
 * - Visual data lineage graph (React Flow)
 * - Code view for action source
 * - "Run Now" button for manual execution
 * - Missing secrets overlay with configuration form
 */

import { CircleNotch, Clock, Code, Eye, EyeSlash, Globe, Key, Lock, Play } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ActionEditor } from "@hands/editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  name?: string;
  description?: string;
  schedule?: string;
  triggers?: Array<"manual" | "webhook" | "pg_notify">;
  hasWebhook?: boolean;
  webhookPath?: string;
  pgNotifyChannel?: string;
  secrets?: string[];
  missingSecrets?: string[];
  hasInput?: boolean;
  inputSchema?: { description?: string };
  schema?: ActionSchema;
  nextRun?: string;
  valid: boolean;
  error?: string;
}

/** Secrets form - used in overlay and inline editing */
function SecretsForm({
  secrets,
  onSave,
  isSaving,
  onCancel,
}: {
  secrets: string[];
  onSave: (secrets: Record<string, string>) => void;
  isSaving: boolean;
  onCancel?: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [showValues, setShowValues] = useState<Record<string, boolean>>({});

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const nonEmpty = Object.fromEntries(
      Object.entries(values).filter(([_, v]) => v.trim())
    );
    if (Object.keys(nonEmpty).length > 0) {
      onSave(nonEmpty);
    }
  };

  const allFilled = secrets.every((key) => values[key]?.trim());

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-2">
        {secrets.map((key) => (
          <div key={key} className="flex items-center gap-2">
            <Label htmlFor={key} className="text-xs font-mono text-muted-foreground w-28 truncate shrink-0">
              {key}
            </Label>
            <div className="relative flex-1">
              <Input
                id={key}
                type={showValues[key] ? "text" : "password"}
                placeholder="••••••••"
                value={values[key] || ""}
                onChange={(e) =>
                  setValues((prev) => ({ ...prev, [key]: e.target.value }))
                }
                className="font-mono text-sm h-8 pr-8"
              />
              <button
                type="button"
                onClick={() => setShowValues((prev) => ({ ...prev, [key]: !prev[key] }))}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showValues[key] ? (
                  <EyeSlash weight="bold" className="h-3.5 w-3.5" />
                ) : (
                  <Eye weight="bold" className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        {onCancel && (
          <Button type="button" variant="ghost" size="xs" onClick={onCancel} className="flex-1">
            Cancel
          </Button>
        )}
        <Button
          type="submit"
          disabled={!allFilled || isSaving}
          size="xs"
          className={onCancel ? "flex-1" : "w-full"}
        >
          {isSaving && <CircleNotch weight="bold" className="h-3.5 w-3.5 animate-spin mr-1.5" />}
          Save
        </Button>
      </div>
    </form>
  );
}

/** Overlay shown when action has missing secrets */
function MissingSecretsOverlay({
  missingSecrets,
  onSave,
  isSaving,
}: {
  missingSecrets: string[];
  onSave: (secrets: Record<string, string>) => void;
  isSaving: boolean;
}) {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-background/60 backdrop-blur-[2px]" />

      <div className="relative z-10 w-full max-w-sm mx-4 bg-card border border-border rounded-lg shadow-lg p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
          <Lock weight="bold" className="h-4 w-4" />
          <span>Configure secrets to unlock</span>
        </div>

        <SecretsForm
          secrets={missingSecrets}
          onSave={onSave}
          isSaving={isSaving}
        />
      </div>
    </div>
  );
}

export function ActionDetailPanel({ actionId }: ActionDetailPanelProps) {
  const port = useRuntimePort();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [showSecretsEditor, setShowSecretsEditor] = useState(false);

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

  // Save secrets mutation
  const saveSecretsMutation = useMutation({
    mutationFn: async (secrets: Record<string, string>) => {
      if (!port) throw new Error("Runtime not connected");
      const res = await fetch(`http://localhost:${port}/trpc/secrets.save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secrets }),
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(err || "Failed to save secrets");
      }
      const json = await res.json();
      return json.result?.data;
    },
    onSuccess: () => {
      // Refresh action to update missingSecrets
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
  const hasMissingSecrets = action.missingSecrets && action.missingSecrets.length > 0;

  return (
    <TooltipProvider delayDuration={0}>
      <div className="h-full flex flex-col relative">
        {/* Missing Secrets Overlay */}
        {hasMissingSecrets && (
          <MissingSecretsOverlay
            missingSecrets={action.missingSecrets!}
            onSave={(secrets) => saveSecretsMutation.mutate(secrets)}
            isSaving={saveSecretsMutation.isPending}
          />
        )}

        {/* Header */}
        <div className="p-4 border-b border-border space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h1 className={cn("text-lg font-semibold truncate", !action.valid && "text-destructive")}>
                {action.name || action.id}
              </h1>
              {action.description && (
                <p className="text-sm text-muted-foreground mt-0.5">
                  {action.description}
                </p>
              )}
              {!action.valid && action.error && (
                <p className="text-sm text-destructive mt-1">
                  Error: {action.error}
                </p>
              )}
            </div>
            <Button
              onClick={() => runMutation.mutate()}
              disabled={runMutation.isPending || hasMissingSecrets || !action.valid}
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

            {/* Secrets indicator */}
            {action.secrets && action.secrets.length > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => !hasMissingSecrets && setShowSecretsEditor(!showSecretsEditor)}
                    className={cn(
                      "flex items-center gap-1 px-2 py-1 rounded-md transition-colors",
                      hasMissingSecrets
                        ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                        : "bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20 hover:bg-green-500/20 cursor-pointer"
                    )}
                  >
                    <Key weight="duotone" className="h-3.5 w-3.5" />
                    <span>
                      {hasMissingSecrets
                        ? `${action.missingSecrets!.length} missing`
                        : `${action.secrets.length} configured`}
                    </span>
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="space-y-1">
                    <p className="font-medium">
                      {hasMissingSecrets ? "Required Secrets" : "Click to edit secrets"}
                    </p>
                    {action.secrets.map((s) => (
                      <p key={s} className="font-mono text-xs flex items-center gap-1.5">
                        {action.missingSecrets?.includes(s) ? (
                          <span className="text-amber-500">●</span>
                        ) : (
                          <span className="text-green-500">●</span>
                        )}
                        {s}
                      </p>
                    ))}
                  </div>
                </TooltipContent>
              </Tooltip>
            )}
          </div>

          {/* Inline Secrets Editor */}
          {showSecretsEditor && action.secrets && action.secrets.length > 0 && (
            <div className="p-3 rounded-md bg-muted/50 border border-border">
              <SecretsForm
                secrets={action.secrets}
                onSave={(secrets) => {
                  saveSecretsMutation.mutate(secrets);
                  setShowSecretsEditor(false);
                }}
                isSaving={saveSecretsMutation.isPending}
                onCancel={() => setShowSecretsEditor(false)}
              />
            </div>
          )}

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
              name={action.name || action.id}
              source={sourceData.source}
              className="h-full"
              onTableClick={(table) => navigate({ to: "/tables/$tableId", params: { tableId: table } })}
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
