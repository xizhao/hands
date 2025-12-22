/**
 * DataSection - Data section in sidebar
 *
 * Displays sources with their tables and unassociated tables.
 */

import {
  ArrowsClockwise,
  CircleNotch,
  Code,
  Key,
  Warning,
} from "@phosphor-icons/react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { SidebarSection, SidebarEmptyState } from "../components/SidebarSection";
import { listItemStyles, NestedItems } from "../components/SidebarItem";
import { ItemActions } from "../components/ItemActions";
import { TablePreviewHoverCard } from "../components/HoverCards";
import { DataIcon, SourceIcon, SourceTypeIcon } from "../components/icons";
import type { SidebarSource } from "../types";
import type { SidebarState } from "../hooks/useSidebarState";
import type { SidebarActions } from "../hooks/useSidebarActions";

interface DataSectionProps {
  /** Section expanded state */
  expanded: boolean;
  /** Toggle section */
  onToggle: () => void;
  /** Sources list */
  sources: SidebarSource[];
  /** Available sources from registry */
  availableSources: Array<{
    name: string;
    title: string;
    description: string;
    secrets: string[];
    icon?: string;
  }>;
  /** Map of source ID to table names */
  sourceTableMap: Map<string, string[]>;
  /** Tables not associated with any source */
  unassociatedTables: string[];
  /** Filter function for source tables */
  getFilteredSourceTables: (tables: string[]) => string[];
  /** Search query (for force-expanding sources) */
  searchQuery: string;
  /** Source expansion state */
  sourcesState: SidebarState["sources"];
  /** Whether DB is loading */
  isDbLoading: boolean;
  /** Actions handlers */
  actions: SidebarActions;
  /** Callback when menu opens/closes */
  onMenuOpenChange?: (open: boolean) => void;
}

export function DataSection({
  expanded,
  onToggle,
  sources,
  availableSources,
  sourceTableMap,
  unassociatedTables,
  getFilteredSourceTables,
  searchQuery,
  sourcesState,
  isDbLoading,
  actions,
  onMenuOpenChange,
}: DataSectionProps) {
  const [addSourceOpen, setAddSourceOpen] = useState(false);
  const [selectedSource, setSelectedSource] = useState<string | null>(null);

  const {
    handleSourceClick,
    handleTableClick,
    handleCopySource,
    handleDeleteSource,
    handleDeleteTable,
    handleConvertToSource,
    handleAddSource,
    syncSource,
    isAdding,
    isSyncing,
    syncingSourceId,
  } = actions;

  const installedSourceNames = sources.map((s) => s.name);
  const availableToAdd = availableSources.filter((s) => !installedSourceNames.includes(s.name));

  const handleAddSourceClick = async (sourceName: string) => {
    setSelectedSource(sourceName);
    await handleAddSource(sourceName);
    setSelectedSource(null);
    setAddSourceOpen(false);
  };

  const hasData = sources.length > 0 || unassociatedTables.length > 0;

  return (
    <>
      <SidebarSection
        title="Data"
        expanded={expanded}
        onToggle={onToggle}
        onAdd={() => setAddSourceOpen(true)}
        addTooltip="Add source"
      >
        {isDbLoading ? (
          <SidebarEmptyState icon={<DataIcon empty />} label="Loading..." />
        ) : hasData ? (
          <>
            {/* Sources with their tables */}
            {sources.map((source) => {
              const isThisSyncing = isSyncing && syncingSourceId === source.id;
              const hasMissingSecrets = source.missingSecrets.length > 0;
              const isSourceExpanded = sourcesState.isExpanded(source.id);
              const sourceTables = sourceTableMap.get(source.id) || [];
              const filteredSourceTables = getFilteredSourceTables(sourceTables);

              return (
                <div key={source.id}>
                  <div className={listItemStyles}>
                    <button
                      onClick={() => sourcesState.toggle(source.id)}
                      className="shrink-0"
                    >
                      {isSourceExpanded ? (
                        <ChevronDown className="h-3 w-3" />
                      ) : (
                        <ChevronRight className="h-3 w-3" />
                      )}
                    </button>
                    <SourceIcon />
                    <button
                      onClick={() => handleSourceClick(source.id)}
                      className="flex-1 truncate text-left hover:underline"
                    >
                      {source.title}
                    </button>
                    {sourceTables.length > 0 && (
                      <span className="text-xs text-muted-foreground/60">
                        {sourceTables.length}
                      </span>
                    )}
                    {hasMissingSecrets && (
                      <Warning
                        weight="fill"
                        className="h-3.5 w-3.5 text-amber-500 shrink-0"
                      />
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        syncSource(source.id);
                      }}
                      disabled={isThisSyncing || hasMissingSecrets}
                      className={cn(
                        "p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-accent transition-all",
                        (isThisSyncing || hasMissingSecrets) &&
                          "opacity-50 cursor-not-allowed",
                      )}
                      title={hasMissingSecrets ? "Configure secrets first" : "Sync now"}
                    >
                      {isThisSyncing ? (
                        <CircleNotch weight="bold" className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <ArrowsClockwise weight="bold" className="h-3.5 w-3.5" />
                      )}
                    </button>
                    <ItemActions
                      onCopy={() => handleCopySource(source.id)}
                      onDelete={() => handleDeleteSource(source.id)}
                      onOpenChange={onMenuOpenChange}
                    />
                  </div>

                  {/* Source's tables */}
                  {(isSourceExpanded || searchQuery) && filteredSourceTables.length > 0 && (
                    <NestedItems className="ml-6 pl-2">
                      {filteredSourceTables.map((tableName) => (
                        <TablePreviewHoverCard key={tableName} tableName={tableName}>
                          <div className={listItemStyles}>
                            <DataIcon />
                            <button
                              onClick={() => handleTableClick(tableName)}
                              className="flex-1 truncate text-left hover:underline"
                            >
                              {tableName}
                            </button>
                            <ItemActions
                              onDelete={() => handleDeleteTable(tableName)}
                              deleteLabel="Drop table"
                              onOpenChange={onMenuOpenChange}
                            />
                          </div>
                        </TablePreviewHoverCard>
                      ))}
                    </NestedItems>
                  )}
                </div>
              );
            })}

            {/* Unassociated tables (flat list) */}
            {unassociatedTables.map((tableName) => (
              <TablePreviewHoverCard key={tableName} tableName={tableName}>
                <div className={listItemStyles}>
                  <DataIcon colored={false} />
                  <button
                    onClick={() => handleTableClick(tableName)}
                    className="flex-1 truncate text-left hover:underline"
                  >
                    {tableName}
                  </button>
                  <ItemActions
                    onConvertToSource={() => handleConvertToSource(tableName)}
                    onDelete={() => handleDeleteTable(tableName)}
                    deleteLabel="Drop table"
                    onOpenChange={onMenuOpenChange}
                  />
                </div>
              </TablePreviewHoverCard>
            ))}
          </>
        ) : (
          <SidebarEmptyState icon={<DataIcon empty />} label="No data" />
        )}
      </SidebarSection>

      {/* Add Source Dialog */}
      <Dialog open={addSourceOpen} onOpenChange={setAddSourceOpen}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Add Data Source</DialogTitle>
          </DialogHeader>
          <DialogBody>
            {availableToAdd.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground">From Registry</div>
                <div className="space-y-1">
                  {availableToAdd.map((source) => {
                    const isThisAdding = isAdding && selectedSource === source.name;
                    return (
                      <button
                        key={source.name}
                        onClick={() => handleAddSourceClick(source.name)}
                        disabled={isAdding}
                        className={cn(
                          "w-full flex items-start gap-3 p-3 rounded-lg border",
                          "hover:bg-accent hover:border-accent-foreground/20 transition-colors text-left",
                          isAdding && "opacity-50 cursor-not-allowed",
                        )}
                      >
                        <SourceTypeIcon
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

            <div className="space-y-2 mt-4">
              <div className="text-xs font-medium text-muted-foreground">Custom</div>
              <button
                onClick={() => setAddSourceOpen(false)}
                className={cn(
                  "w-full flex items-start gap-3 p-3 rounded-lg border border-dashed",
                  "hover:bg-accent hover:border-accent-foreground/20 transition-colors text-left",
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
    </>
  );
}
