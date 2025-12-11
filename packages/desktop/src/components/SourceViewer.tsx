/**
 * SourceViewer - View and manage a single source
 *
 * Shows source config, sync status, tables created, and manual sync button.
 */

import { useSourceManagement, type Source } from "@/hooks/useSources";
import { useDbSchema } from "@/hooks/useWorkbook";
import { cn } from "@/lib/utils";
import {
  Database,
  Table,
  ArrowsClockwise,
  CheckCircle,
  XCircle,
  Warning,
  CircleNotch,
  Clock,
  Key,
} from "@phosphor-icons/react";

interface SourceViewerProps {
  sourceId: string;
}

export function SourceViewer({ sourceId }: SourceViewerProps) {
  const {
    sources,
    isLoading,
    syncSource,
    isSyncing,
    syncingSourceId,
    syncResult,
  } = useSourceManagement();

  const { data: schema } = useDbSchema(null);

  const source = sources.find((s) => s.id === sourceId);
  const isThisSyncing = isSyncing && syncingSourceId === sourceId;

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <CircleNotch weight="bold" className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!source) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 text-muted-foreground">
        <Database weight="duotone" className="h-12 w-12 opacity-50" />
        <p>Source not found</p>
        <p className="text-sm opacity-70">ID: {sourceId}</p>
      </div>
    );
  }

  const hasMissingSecrets = source.missingSecrets.length > 0;

  // Find tables that might belong to this source (heuristic: tables with source name prefix)
  const relatedTables = schema?.filter((t) =>
    t.table_name.toLowerCase().startsWith(source.name.toLowerCase().replace(/-/g, "_"))
  ) ?? [];

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-start gap-4">
          <div className="p-3 bg-purple-500/10 rounded-lg">
            <Database weight="duotone" className="h-8 w-8 text-purple-400" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-semibold">{source.title}</h1>
            <p className="text-muted-foreground mt-1">{source.description}</p>
          </div>
        </div>

        {/* Missing Secrets Warning */}
        {hasMissingSecrets && (
          <div className="flex items-start gap-3 p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg">
            <Warning weight="fill" className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-amber-500">Missing Secrets</p>
              <p className="text-sm text-muted-foreground mt-1">
                Configure these secrets in your <code className="bg-muted px-1 rounded">.env.local</code> file:
              </p>
              <div className="flex flex-wrap gap-2 mt-2">
                {source.missingSecrets.map((secret) => (
                  <code
                    key={secret}
                    className="px-2 py-0.5 bg-muted rounded text-sm font-mono"
                  >
                    {secret}
                  </code>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Sync Button */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => syncSource(sourceId)}
            disabled={isThisSyncing || hasMissingSecrets}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors",
              hasMissingSecrets
                ? "bg-muted text-muted-foreground cursor-not-allowed"
                : "bg-purple-500 hover:bg-purple-600 text-white"
            )}
          >
            {isThisSyncing ? (
              <>
                <CircleNotch weight="bold" className="h-4 w-4 animate-spin" />
                Syncing...
              </>
            ) : (
              <>
                <ArrowsClockwise weight="bold" className="h-4 w-4" />
                Sync Now
              </>
            )}
          </button>

          {/* Last sync result */}
          {syncResult && syncingSourceId === sourceId && !isSyncing && (
            <div
              className={cn(
                "flex items-center gap-2 text-sm",
                syncResult.success ? "text-green-500" : "text-red-500"
              )}
            >
              {syncResult.success ? (
                <>
                  <CheckCircle weight="fill" className="h-4 w-4" />
                  Synced in {syncResult.durationMs}ms
                </>
              ) : (
                <>
                  <XCircle weight="fill" className="h-4 w-4" />
                  {syncResult.error}
                </>
              )}
            </div>
          )}
        </div>

        {/* Source Info */}
        <div className="grid gap-4">
          {/* Schedule */}
          {source.schedule && (
            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
              <Clock weight="duotone" className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Schedule</p>
                <p className="text-sm text-muted-foreground font-mono">{source.schedule}</p>
              </div>
            </div>
          )}

          {/* Required Secrets */}
          {source.secrets.length > 0 && (
            <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
              <Key weight="duotone" className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium">Required Secrets</p>
                <div className="flex flex-wrap gap-2 mt-1">
                  {source.secrets.map((secret) => (
                    <code
                      key={secret}
                      className={cn(
                        "px-2 py-0.5 rounded text-xs font-mono",
                        source.missingSecrets.includes(secret)
                          ? "bg-amber-500/20 text-amber-500"
                          : "bg-green-500/20 text-green-500"
                      )}
                    >
                      {secret}
                    </code>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Related Tables */}
        {relatedTables.length > 0 && (
          <div>
            <h2 className="text-sm font-medium text-muted-foreground mb-2">
              Tables
            </h2>
            <div className="space-y-1">
              {relatedTables.map((table) => (
                <div
                  key={table.table_name}
                  className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg"
                >
                  <Table weight="duotone" className="h-4 w-4 text-blue-400" />
                  <span className="font-mono text-sm">{table.table_name}</span>
                  <span className="text-xs text-muted-foreground ml-auto">
                    {table.columns.length} columns
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Source ID (technical) */}
        <div className="pt-4 border-t">
          <p className="text-xs text-muted-foreground">
            Source ID: <code className="bg-muted px-1 rounded">{source.id}</code>
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Name: <code className="bg-muted px-1 rounded">{source.name}</code>
          </p>
        </div>
      </div>
    </div>
  );
}
