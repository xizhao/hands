/**
 * PagesSection - Pages section in sidebar
 *
 * Displays pages with folder grouping and inline creation.
 */

import { CircleNotch, Folder, FolderOpen } from "@phosphor-icons/react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useCallback } from "react";
import { cn } from "@/lib/utils";
import { ThumbnailHoverCard } from "../components/HoverCards";
import { ItemActions } from "../components/ItemActions";
import { PageIcon } from "../components/icons";
import { listItemStyles, SidebarFolder } from "../components/SidebarItem";
import { SidebarEmptyState, SidebarSection } from "../components/SidebarSection";
import type { SidebarActions } from "../hooks/useSidebarActions";
import type { SidebarState } from "../hooks/useSidebarState";
import type { SidebarPage } from "../types";

interface PagesSectionProps {
  /** Section expanded state */
  expanded: boolean;
  /** Toggle section */
  onToggle: () => void;
  /** Root pages (no folder) */
  rootPages: SidebarPage[];
  /** Pages grouped by folder */
  pageFolders: Map<string, SidebarPage[]>;
  /** Folder expansion state */
  folders: SidebarState["folders"];
  /** Filter function for folder pages */
  getFilteredFolderPages: (pages: SidebarPage[]) => SidebarPage[];
  /** Search query (for force-expanding folders) */
  searchQuery: string;
  /** All pages (for new page creation) */
  allPages: SidebarPage[];
  /** Whether manifest is loading */
  isLoading: boolean;
  /** Actions handlers */
  actions: SidebarActions;
  /** Callback when menu opens/closes */
  onMenuOpenChange?: (open: boolean) => void;
  /** Size variant */
  size?: "default" | "lg";
}

export function PagesSection({
  expanded,
  onToggle,
  rootPages,
  pageFolders,
  folders,
  getFilteredFolderPages,
  searchQuery,
  allPages,
  isLoading,
  actions,
  onMenuOpenChange,
  size,
}: PagesSectionProps) {
  const {
    isCreatingNewPage,
    isCreatingPage,
    newPageName,
    setNewPageName,
    handleStartNewPage,
    handleCancelNewPage,
    handleConfirmNewPage,
    handlePageClick,
    handleDuplicatePage,
    handleDeletePage,
    prefetchThumbnail,
  } = actions;

  const newPageInputRef = useCallback((node: HTMLInputElement | null) => {
    if (node) node.focus();
  }, []);

  const handleNewPageKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleConfirmNewPage(allPages);
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleCancelNewPage();
    }
  };

  const hasPages = rootPages.length > 0 || pageFolders.size > 0 || isCreatingNewPage;

  const totalPages = rootPages.length + Array.from(pageFolders.values()).flat().length;

  return (
    <SidebarSection
      title="Docs"
      type="docs"
      count={totalPages}
      expanded={expanded}
      onToggle={onToggle}
      onAdd={handleStartNewPage}
      addTooltip="New doc"
      size={size}
    >
      {/* Inline new page input */}
      {isCreatingNewPage && (
        <div className={cn(listItemStyles, "pr-1")}>
          <PageIcon />
          <input
            ref={newPageInputRef}
            type="text"
            value={newPageName}
            onChange={(e) => setNewPageName(e.target.value)}
            onKeyDown={handleNewPageKeyDown}
            onBlur={() => handleConfirmNewPage(allPages)}
            placeholder="page-name"
            disabled={isCreatingPage}
            className="flex-1 bg-transparent border-none outline-none text-sm placeholder:text-muted-foreground/50"
          />
          {isCreatingPage && (
            <CircleNotch weight="bold" className="h-3 w-3 animate-spin text-muted-foreground" />
          )}
        </div>
      )}

      {isLoading ? (
        <SidebarEmptyState label="Loading..." />
      ) : hasPages ? (
        <>
          {/* Root pages */}
          {rootPages.map((page) => (
            <ThumbnailHoverCard
              key={page.id}
              type="page"
              contentId={page.id}
              onMouseEnter={() => prefetchThumbnail("page", page.id)}
            >
              <div className={cn(listItemStyles, "group")}>
                <PageIcon />
                <button
                  onClick={() => handlePageClick(page.id)}
                  className="flex-1 truncate text-left hover:underline"
                >
                  {page.title}
                </button>
                <ItemActions
                  onCopy={() => handleDuplicatePage(page.id)}
                  onDelete={() => handleDeletePage(page.id)}
                  onOpenChange={onMenuOpenChange}
                />
              </div>
            </ThumbnailHoverCard>
          ))}

          {/* Page folders */}
          {Array.from(pageFolders.entries()).map(([folderName, folderPages]) => {
            const isFolderExpanded = folders.isExpanded(folderName);
            const filteredFolderPages = getFilteredFolderPages(folderPages);

            // Skip folder if search active and no matching pages
            if (searchQuery && filteredFolderPages.length === 0) return null;

            return (
              <SidebarFolder
                key={folderName}
                chevron={
                  isFolderExpanded ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )
                }
                icon={
                  isFolderExpanded ? (
                    <FolderOpen weight="duotone" className="h-4 w-4 text-blue-400/70" />
                  ) : (
                    <Folder weight="duotone" className="h-4 w-4 text-blue-400/70" />
                  )
                }
                label={folderName}
                count={folderPages.length}
                onToggle={() => folders.toggle(folderName)}
              >
                {/* Folder contents */}
                {(isFolderExpanded || searchQuery) &&
                  filteredFolderPages.length > 0 &&
                  filteredFolderPages.map((page) => (
                    <ThumbnailHoverCard
                      key={page.id}
                      type="page"
                      contentId={page.id}
                      onMouseEnter={() => prefetchThumbnail("page", page.id)}
                    >
                      <div className={cn(listItemStyles, "group")}>
                        <PageIcon />
                        <button
                          onClick={() => handlePageClick(page.id)}
                          className="flex-1 truncate text-left hover:underline"
                        >
                          {page.title}
                        </button>
                        <ItemActions
                          onCopy={() => handleDuplicatePage(page.id)}
                          onDelete={() => handleDeletePage(page.id)}
                          onOpenChange={onMenuOpenChange}
                        />
                      </div>
                    </ThumbnailHoverCard>
                  ))}
              </SidebarFolder>
            );
          })}
        </>
      ) : (
        <SidebarEmptyState label="No docs" />
      )}
    </SidebarSection>
  );
}
