/**
 * NotebookSidebar - Navigation sidebar for Pages, Data, Actions, and Plugins
 *
 * Structure:
 * - hooks/ - State management and CRUD operations
 * - components/ - Reusable UI components
 * - sections/ - Feature-specific section components
 */

import { Search, X } from "lucide-react";
import { useState } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useSourceManagement } from "@/hooks/useSources";
import { cn } from "@/lib/utils";

import { useSidebarState } from "./hooks/useSidebarState";
import { useSidebarData } from "./hooks/useSidebarData";
import { useSidebarActions } from "./hooks/useSidebarActions";
import { PagesSection } from "./sections/PagesSection";
import { DataSection } from "./sections/DataSection";
import { ActionsSection } from "./sections/ActionsSection";
import { PluginsSection } from "./sections/PluginsSection";

export interface NotebookSidebarProps {
  /** Full-width grid layout */
  fullWidth?: boolean;
  /** Callback when a dropdown menu opens/closes */
  onMenuOpenChange?: (open: boolean) => void;
  /** When true, prevents navigation on item click */
  preventNavigation?: boolean;
  /** Callback when an item is selected (for preview mode) */
  onSelectItem?: (type: "page" | "source" | "table" | "action", id: string) => void;
  /** External filter query - hides internal search when provided */
  filterQuery?: string;
}

export function NotebookSidebar({
  fullWidth = false,
  onMenuOpenChange,
  preventNavigation = false,
  onSelectItem,
  filterQuery,
}: NotebookSidebarProps) {
  // Search state - use external if provided
  const hasExternalFilter = filterQuery !== undefined;
  const [internalQuery, setInternalQuery] = useState("");
  const searchQuery = hasExternalFilter ? (filterQuery || "") : internalQuery;

  // Hooks
  const state = useSidebarState();
  const data = useSidebarData({ searchQuery });
  const actions = useSidebarActions({ preventNavigation, onSelectItem });
  const { availableSources } = useSourceManagement();

  return (
    <TooltipProvider delayDuration={0}>
      <div className={cn("w-full", fullWidth && "max-w-4xl mx-auto")}>
        {/* Search - only if no external filter */}
        {!hasExternalFilter && (
          <div className={cn("relative", fullWidth ? "max-w-md mb-6" : "mb-3")}>
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/70" />
            <input
              type="text"
              placeholder="Search pages, sources..."
              value={internalQuery}
              onChange={(e) => setInternalQuery(e.target.value)}
              className="w-full pl-8 pr-8 py-1.5 text-sm bg-muted/50 border border-border/70 rounded-md placeholder:text-muted-foreground/60 focus:outline-none focus:border-border focus:ring-1 focus:ring-ring/20"
            />
            {internalQuery && (
              <button
                onClick={() => setInternalQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/70 hover:text-muted-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}

        {/* Sections */}
        <div className={cn(fullWidth ? "grid grid-cols-1 md:grid-cols-2 gap-6" : "space-y-3")}>
          <PagesSection
            expanded={state.sections.pages.expanded || (!!searchQuery && (data.rootPages.length > 0 || data.pageFolders.size > 0))}
            onToggle={state.sections.pages.toggle}
            rootPages={data.rootPages}
            pageFolders={data.pageFolders}
            folders={state.folders}
            getFilteredFolderPages={data.getFilteredFolderPages}
            searchQuery={searchQuery}
            allPages={data.pages}
            isLoading={data.isLoading}
            actions={actions}
            onMenuOpenChange={onMenuOpenChange}
            size={fullWidth ? "lg" : "default"}
          />

          <DataSection
            expanded={state.sections.data.expanded || (!!searchQuery && (data.sources.length > 0 || data.unassociatedTables.length > 0))}
            onToggle={state.sections.data.toggle}
            sources={data.sources}
            availableSources={availableSources}
            sourceTableMap={data.sourceTableMap}
            unassociatedTables={data.unassociatedTables}
            getFilteredSourceTables={data.getFilteredSourceTables}
            searchQuery={searchQuery}
            sourcesState={state.sources}
            actions={actions}
            onMenuOpenChange={onMenuOpenChange}
            size={fullWidth ? "lg" : "default"}
          />

          <ActionsSection
            expanded={state.sections.actions.expanded || (!!searchQuery && data.filteredActions.length > 0)}
            onToggle={state.sections.actions.toggle}
            actions={data.filteredActions}
            handlers={actions}
            size={fullWidth ? "lg" : "default"}
          />

          <PluginsSection
            expanded={state.sections.plugins.expanded || (!!searchQuery && data.filteredPlugins.length > 0)}
            onToggle={state.sections.plugins.toggle}
            plugins={data.filteredPlugins}
            size={fullWidth ? "lg" : "default"}
          />
        </div>
      </div>
    </TooltipProvider>
  );
}

// Re-exports
export * from "./types";
export { useSidebarState } from "./hooks/useSidebarState";
export { useSidebarData } from "./hooks/useSidebarData";
export { useSidebarActions } from "./hooks/useSidebarActions";
