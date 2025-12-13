/**
 * SourcesPanel - Shows installed sources and database tables
 */

import {
  ArrowsClockwise,
  CheckCircle,
  CircleNotch,
  Code,
  Database,
  Key,
  Newspaper,
  Plus,
  Table,
  Warning,
  XCircle,
} from "@phosphor-icons/react";
import { useState } from "react";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useRuntimeState } from "@/hooks/useRuntimeState";
import { type AvailableSource, type Source, useSourceManagement } from "@/hooks/useSources";
import { cn } from "@/lib/utils";

// Map icon names to Phosphor icons
const iconMap: Record<string, React.ElementType> = {
  newspaper: Newspaper,
  code: Code,
};

function SourceIcon({ icon, className }: { icon?: string; className?: string }) {
  const Icon = icon && iconMap[icon] ? iconMap[icon] : Database;
  return <Icon weight="duotone" className={className} />;
}

interface AddSourceDialogProps {
  availableSources: AvailableSource[];
  installedSourceNames: string[];
  onAdd: (sourceName: string) => Promise<void>;
  isAdding: boolean;
}

function AddSourceDialog({
  availableSources,
  installedSourceNames,
  onAdd,
  isAdding,
}: AddSourceDialogProps) {
  const [open, setOpen] = useState(false);
  const [selectedSource, setSelectedSource] = useState<string | null>(null);

  const handleAdd = async (sourceName: string) => {
    setSelectedSource(sourceName);
    await onAdd(sourceName);
    setSelectedSource(null);
    setOpen(false);
  };

  // Filter out already installed sources
  const availableToAdd = availableSources.filter((s) => !installedSourceNames.includes(s.name));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          className={cn(
            "flex items-center gap-1.5 px-2 py-1 rounded-md text-xs",
            "text-muted-foreground hover:text-foreground hover:bg-accent transition-colors",
          )}
        >
          <Plus weight="bold" className="h-3.5 w-3.5" />
          Add Source
        </button>
      </DialogTrigger>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Add Data Source</DialogTitle>
        </DialogHeader>
        <DialogBody>
          {/* Registry Sources */}
          {availableToAdd.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">From Registry</div>
              <div className="space-y-1">
                {availableToAdd.map((source) => {
                  const isThisAdding = isAdding && selectedSource === source.name;
                  return (
                    <button
                      key={source.name}
                      onClick={() => handleAdd(source.name)}
                      disabled={isAdding}
                      className={cn(
                        "w-full flex items-start gap-3 p-3 rounded-lg border",
                        "hover:bg-accent hover:border-accent-foreground/20 transition-colors",
                        "text-left",
                        isAdding && "opacity-50 cursor-not-allowed",
                      )}
                    >
                      <SourceIcon
                        icon={source.icon}
                        className="h-5 w-5 text-purple-400 shrink-0 mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium">{source.title}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {source.description}
                        </div>
                        {source.secrets.length > 0 && (
                          <div className="flex items-center gap-1 mt-1.5 text-xs text-amber-500">
                            <Key weight="fill" className="h-3 w-3" />
                            Requires: {source.secrets.join(", ")}
                          </div>
                        )}
                      </div>
                      {isThisAdding && (
                        <CircleNotch weight="bold" className="h-4 w-4 animate-spin shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {availableToAdd.length === 0 && availableSources.length > 0 && (
            <div className="text-center py-4 text-sm text-muted-foreground">
              All available sources are already installed
            </div>
          )}

          {/* Blank Source Option */}
          <div className="space-y-2 mt-4">
            <div className="text-xs font-medium text-muted-foreground">Custom</div>
            <button
              onClick={() => {
                // TODO: Navigate to create blank source
                setOpen(false);
              }}
              className={cn(
                "w-full flex items-start gap-3 p-3 rounded-lg border border-dashed",
                "hover:bg-accent hover:border-accent-foreground/20 transition-colors",
                "text-left",
              )}
            >
              <Code weight="duotone" className="h-5 w-5 text-blue-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="font-medium">Blank Source</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Create a custom source from scratch
                </div>
              </div>
            </button>
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

export function SourcesPanel() {
  const { schema, isDbBooting, isStarting } = useRuntimeState();
  const schemaLoading = isStarting || isDbBooting;
  const {
    sources,
    isLoading: sourcesLoading,
    syncSource,
    isSyncing,
    syncingSourceId,
    syncResult,
    availableSources,
    addSource,
    isAdding,
  } = useSourceManagement();

  const [lastSyncedId, setLastSyncedId] = useState<string | null>(null);

  const handleSync = async (source: Source) => {
    setLastSyncedId(source.id);
    await syncSource(source.id);
  };

  const handleAddSource = async (sourceName: string) => {
    await addSource(sourceName);
  };

  const isLoading = schemaLoading || sourcesLoading;

  if (isLoading) {
    return <div className="p-4 text-sm text-muted-foreground">Loading...</div>;
  }

  const hasSources = sources.length > 0;
  const hasTables = schema && schema.length > 0;
  const installedSourceNames = sources.map((s) => s.name);

  return (
    <div className="p-2 space-y-4">
      {/* Header with Add button */}
      <div className="flex items-center justify-between px-2">
        <div className="text-xs font-medium text-muted-foreground">Sources</div>
        <AddSourceDialog
          availableSources={availableSources}
          installedSourceNames={installedSourceNames}
          onAdd={handleAddSource}
          isAdding={isAdding}
        />
      </div>

      {/* Sources List */}
      {hasSources ? (
        <div className="space-y-1">
          {sources.map((source) => {
            const isThisSyncing = isSyncing && syncingSourceId === source.id;
            const showResult = lastSyncedId === source.id && syncResult && !isSyncing;
            const hasMissingSecrets = source.missingSecrets.length > 0;

            return (
              <div
                key={source.id}
                className={cn(
                  "flex items-center gap-2 px-2 py-1.5 rounded-md",
                  "text-sm hover:bg-accent transition-colors group",
                )}
              >
                <Database weight="duotone" className="h-4 w-4 text-purple-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="truncate">{source.title}</div>
                  {hasMissingSecrets && (
                    <div className="text-xs text-amber-500 flex items-center gap-1">
                      <Warning weight="fill" className="h-3 w-3" />
                      Missing: {source.missingSecrets.join(", ")}
                    </div>
                  )}
                  {showResult && (
                    <div
                      className={cn(
                        "text-xs flex items-center gap-1",
                        syncResult.success ? "text-green-500" : "text-red-500",
                      )}
                    >
                      {syncResult.success ? (
                        <>
                          <CheckCircle weight="fill" className="h-3 w-3" />
                          Synced in {syncResult.durationMs}ms
                        </>
                      ) : (
                        <>
                          <XCircle weight="fill" className="h-3 w-3" />
                          {syncResult.error}
                        </>
                      )}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => handleSync(source)}
                  disabled={isThisSyncing || hasMissingSecrets}
                  className={cn(
                    "p-1 rounded hover:bg-accent-foreground/10 transition-colors",
                    "opacity-0 group-hover:opacity-100",
                    (isThisSyncing || hasMissingSecrets) && "opacity-50 cursor-not-allowed",
                  )}
                  title={hasMissingSecrets ? "Configure secrets first" : "Sync now"}
                >
                  {isThisSyncing ? (
                    <CircleNotch weight="bold" className="h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowsClockwise weight="bold" className="h-4 w-4" />
                  )}
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-6 text-center px-2">
          <Database weight="duotone" className="h-8 w-8 text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground">No sources yet</p>
          <p className="text-xs text-muted-foreground/70 mt-1">Add a source to sync data</p>
        </div>
      )}

      {/* Tables Section */}
      {hasTables && (
        <div>
          <div className="text-xs font-medium text-muted-foreground px-2 mb-1">Tables</div>
          <div className="space-y-1">
            {schema.map((table) => (
              <div
                key={table.table_name}
                className={cn(
                  "flex items-center gap-2 px-2 py-1.5 rounded-md",
                  "text-sm hover:bg-accent transition-colors",
                )}
              >
                <Table weight="duotone" className="h-4 w-4 text-blue-400 shrink-0" />
                <span className="flex-1 truncate">{table.table_name}</span>
                <span className="text-xs text-muted-foreground">{table.columns.length} cols</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
