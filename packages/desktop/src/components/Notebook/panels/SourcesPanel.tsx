/**
 * SourcesPanel - Shows installed sources and database tables
 */

import { useDbSchema } from "@/hooks/useWorkbook"
import { useSourceManagement, type Source } from "@/hooks/useSources"
import {
  Database,
  Table,
  ArrowsClockwise,
  CheckCircle,
  XCircle,
  Warning,
  CircleNotch,
} from "@phosphor-icons/react"
import { cn } from "@/lib/utils"
import { useState } from "react"

export function SourcesPanel() {
  const { data: schema, isLoading: schemaLoading } = useDbSchema(null)
  const {
    sources,
    isLoading: sourcesLoading,
    syncSource,
    isSyncing,
    syncingSourceId,
    syncResult,
  } = useSourceManagement()

  const [lastSyncedId, setLastSyncedId] = useState<string | null>(null)

  const handleSync = async (source: Source) => {
    setLastSyncedId(source.id)
    await syncSource(source.id)
  }

  const isLoading = schemaLoading || sourcesLoading

  if (isLoading) {
    return (
      <div className="p-4 text-sm text-muted-foreground">Loading...</div>
    )
  }

  const hasSources = sources.length > 0
  const hasTables = schema && schema.length > 0

  if (!hasSources && !hasTables) {
    return (
      <div className="p-4">
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Database weight="duotone" className="h-8 w-8 text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground">No data yet</p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            Add sources or import data
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-2 space-y-4">
      {/* Sources Section */}
      {hasSources && (
        <div>
          <div className="text-xs font-medium text-muted-foreground px-2 mb-1">
            Sources
          </div>
          <div className="space-y-1">
            {sources.map((source) => {
              const isThisSyncing = isSyncing && syncingSourceId === source.id
              const showResult = lastSyncedId === source.id && syncResult && !isSyncing
              const hasMissingSecrets = source.missingSecrets.length > 0

              return (
                <div
                  key={source.id}
                  className={cn(
                    "flex items-center gap-2 px-2 py-1.5 rounded-md",
                    "text-sm hover:bg-accent transition-colors group"
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
                          syncResult.success ? "text-green-500" : "text-red-500"
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
                      (isThisSyncing || hasMissingSecrets) && "opacity-50 cursor-not-allowed"
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
              )
            })}
          </div>
        </div>
      )}

      {/* Tables Section */}
      {hasTables && (
        <div>
          <div className="text-xs font-medium text-muted-foreground px-2 mb-1">
            Tables
          </div>
          <div className="space-y-1">
            {schema.map((table) => (
              <div
                key={table.table_name}
                className={cn(
                  "flex items-center gap-2 px-2 py-1.5 rounded-md",
                  "text-sm hover:bg-accent transition-colors"
                )}
              >
                <Table weight="duotone" className="h-4 w-4 text-blue-400 shrink-0" />
                <span className="flex-1 truncate">{table.table_name}</span>
                <span className="text-xs text-muted-foreground">
                  {table.columns.length} cols
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
