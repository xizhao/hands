/**
 * ActionsTab - Domain-specific actions
 *
 * Shows actions that are associated with this domain/table.
 * Actions can be triggered manually or scheduled.
 */

import { AlertCircle, Clock, Play, Plus, Zap } from "lucide-react";
import { useRuntimeState } from "@/hooks/useRuntimeState";
import { cn } from "@/lib/utils";
import type { Domain } from "../../sidebar/domain/types";

interface ActionsTabProps {
  domain: Domain;
}

export function ActionsTab({ domain }: ActionsTabProps) {
  const { manifest } = useRuntimeState();
  const allActions = manifest?.actions ?? [];

  // Filter actions related to this domain
  const domainActions = allActions.filter((a) =>
    a.id.toLowerCase().includes(domain.id.toLowerCase()),
  );

  const hasActions = domainActions.length > 0;

  return (
    <div className="h-full overflow-auto p-4">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium">Actions</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Server-side operations for {domain.name}
            </p>
          </div>
          <button
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium",
              "bg-muted hover:bg-accent transition-colors",
            )}
          >
            <Plus className="h-3.5 w-3.5" />
            Create Action
          </button>
        </div>

        {/* Actions List */}
        {hasActions ? (
          <div className="space-y-3">
            {domainActions.map((action) => (
              <ActionCard key={action.id} action={action} />
            ))}
          </div>
        ) : (
          <EmptyActions domain={domain} />
        )}

        {/* Suggested Actions */}
        <SuggestedActions domain={domain} />
      </div>
    </div>
  );
}

interface ActionCardProps {
  action: {
    id: string;
    name?: string;
    description?: string;
    schedule?: string;
    valid: boolean;
    error?: string;
  };
}

function ActionCard({ action }: ActionCardProps) {
  return (
    <div
      className={cn(
        "rounded-lg border p-3 transition-colors",
        action.valid ? "border-border hover:border-border/80" : "border-red-500/30 bg-red-500/5",
      )}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div
          className={cn(
            "flex-shrink-0 w-8 h-8 rounded flex items-center justify-center",
            action.valid ? "bg-orange-500/10" : "bg-red-500/10",
          )}
        >
          {action.valid ? (
            <Zap className="h-4 w-4 text-orange-500" />
          ) : (
            <AlertCircle className="h-4 w-4 text-red-500" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">{action.name || action.id}</span>
            {action.schedule && (
              <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                <Clock className="h-3 w-3" />
                {action.schedule}
              </span>
            )}
          </div>
          {action.description && (
            <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
              {action.description}
            </p>
          )}
          {!action.valid && action.error && (
            <p className="mt-1 text-xs text-red-500">{action.error}</p>
          )}
        </div>

        {/* Run button */}
        {action.valid && (
          <button
            className={cn(
              "flex-shrink-0 flex items-center gap-1 px-2 py-1 rounded text-xs font-medium",
              "bg-orange-500/10 text-orange-500 hover:bg-orange-500/20 transition-colors",
            )}
          >
            <Play className="h-3 w-3" />
            Run
          </button>
        )}
      </div>
    </div>
  );
}

interface EmptyActionsProps {
  domain: Domain;
}

function EmptyActions({ domain }: EmptyActionsProps) {
  return (
    <div className="rounded-lg border border-dashed border-border p-8 text-center">
      <Zap className="h-8 w-8 mx-auto text-muted-foreground/50" />
      <h4 className="mt-3 text-sm font-medium">No Actions Yet</h4>
      <p className="mt-1 text-xs text-muted-foreground">
        Create server-side actions to process {domain.name} data.
      </p>
      <button
        className={cn(
          "mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium",
          "bg-orange-500/10 text-orange-500 hover:bg-orange-500/20 transition-colors",
        )}
      >
        <Plus className="h-3.5 w-3.5" />
        Create First Action
      </button>
    </div>
  );
}

interface SuggestedActionsProps {
  domain: Domain;
}

function SuggestedActions({ domain }: SuggestedActionsProps) {
  const suggestions = [
    {
      id: "export",
      name: `Export ${domain.name}`,
      description: "Export table data to CSV or JSON",
    },
    {
      id: "sync",
      name: `Sync ${domain.name}`,
      description: "Sync with external data source",
    },
    {
      id: "validate",
      name: `Validate ${domain.name}`,
      description: "Run data validation rules",
    },
  ];

  return (
    <div className="pt-6 border-t border-border">
      <h4 className="text-xs font-medium text-muted-foreground mb-3">Suggested Actions</h4>
      <div className="grid gap-2">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion.id}
            className={cn(
              "flex items-center gap-3 p-2 rounded-md text-left",
              "bg-muted/50 hover:bg-muted transition-colors",
            )}
          >
            <div className="w-6 h-6 rounded bg-muted flex items-center justify-center">
              <Plus className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div>
              <div className="text-sm font-medium">{suggestion.name}</div>
              <div className="text-xs text-muted-foreground">{suggestion.description}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

export default ActionsTab;
