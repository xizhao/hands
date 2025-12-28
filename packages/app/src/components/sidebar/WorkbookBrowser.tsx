/**
 * WorkbookBrowser - Clean workbook file/data browser
 *
 * The main workbook window content (chat moved to FloatingChat):
 * - Workbook header with switcher
 * - Search/filter input
 * - NotebookSidebar (pages, sources, tables, actions)
 */

import { SaveStatusIndicator } from "@/components/SaveStatusIndicator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { resetSidebarState } from "./notebook/hooks/useSidebarState";
import { useNeedsTrafficLightOffset } from "@/hooks/useFullscreen";
import { useClearNavigation } from "@/hooks/useNavState";
import { useRuntimeProcess } from "@/hooks/useRuntimeState";
import {
  useCreateWorkbook,
  useOpenWorkbook,
  useUpdateWorkbook,
  useWorkbooks,
} from "@/hooks/useWorkbook";
import type { Workbook } from "@/lib/workbook";
import { cn } from "@/lib/utils";
import { useRouter } from "@tanstack/react-router";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
} from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { NotebookSidebar } from "./NotebookSidebar";

interface WorkbookBrowserProps {
  onSelectItem?: (
    type: "page" | "source" | "table" | "action",
    id: string
  ) => void;
}

export function WorkbookBrowser({ onSelectItem }: WorkbookBrowserProps) {
  const router = useRouter();
  const { workbookId: activeWorkbookId } = useRuntimeProcess();
  const needsTrafficLightOffset = useNeedsTrafficLightOffset();
  const clearNavigation = useClearNavigation();

  // Workbook management
  const { data: workbooks } = useWorkbooks();
  const createWorkbook = useCreateWorkbook();
  const openWorkbook = useOpenWorkbook();
  const updateWorkbook = useUpdateWorkbook();

  // Current workbook
  const currentWorkbook = workbooks?.find((w) => w.id === activeWorkbookId);
  const titleInputRef = useRef<HTMLSpanElement>(null);

  // Search/filter state
  const [filterQuery, setFilterQuery] = useState("");

  // Workbook handlers
  const handleSwitchWorkbook = useCallback(
    (workbook: Workbook) => {
      clearNavigation();
      resetSidebarState();
      openWorkbook.mutate(workbook);
    },
    [clearNavigation, openWorkbook]
  );

  const handleCreateWorkbook = useCallback(() => {
    createWorkbook.mutate(
      { name: "Untitled Workbook" },
      {
        onSuccess: (newWorkbook) => {
          clearNavigation();
          resetSidebarState();
          openWorkbook.mutate(newWorkbook, {
            onSuccess: () => {
              router.navigate({
                to: "/pages/$pageId",
                params: { pageId: "welcome" },
              });
            },
          });
        },
      }
    );
  }, [clearNavigation, createWorkbook, openWorkbook, router]);

  return (
    <div className="flex flex-col h-full w-full">
      {/* Workbook header with traffic light offset */}
      <div
        data-tauri-drag-region
        className={cn(
          "shrink-0 flex items-center gap-1 h-10 border-b border-border/50",
          needsTrafficLightOffset ? "pl-[80px] pr-3" : "px-3"
        )}
      >
        {/* Editable workbook title */}
        <span
          ref={titleInputRef}
          contentEditable
          suppressContentEditableWarning
          onBlur={(e) => {
            const newName = e.currentTarget.textContent?.trim() || "";
            if (currentWorkbook && newName && newName !== currentWorkbook.name) {
              updateWorkbook.mutate({
                ...currentWorkbook,
                name: newName,
                updated_at: Date.now(),
              });
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.blur();
            } else if (e.key === "Escape") {
              e.currentTarget.textContent = currentWorkbook?.name ?? "Untitled";
              e.currentTarget.blur();
            }
          }}
          className={cn(
            "px-1 py-0.5 text-sm font-medium bg-transparent rounded-sm cursor-text",
            "outline-none truncate max-w-[140px]",
            "hover:bg-accent/50",
            "focus:bg-background focus:ring-1 focus:ring-ring/20"
          )}
          spellCheck={false}
        >
          {currentWorkbook?.name ?? "Untitled"}
        </span>

        {/* Workbook switcher dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center justify-center w-5 h-5 rounded-sm text-muted-foreground/70 hover:text-muted-foreground hover:bg-accent/50">
            <ChevronDown className="h-3 w-3" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[200px]">
            {workbooks?.map((wb) => (
              <DropdownMenuItem
                key={wb.id}
                onClick={() => handleSwitchWorkbook(wb)}
                className="flex items-center justify-between"
              >
                <span className="truncate text-[13px]">{wb.name}</span>
                {wb.id === activeWorkbookId && (
                  <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                )}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleCreateWorkbook}>
              <Plus className="h-3.5 w-3.5 mr-2" />
              <span className="text-[13px]">New Notebook</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Right side: save status + navigation */}
        <div className="ml-auto flex items-center gap-1">
          <SaveStatusIndicator />
          <button
            onClick={() => router.history.back()}
            className="p-1 text-muted-foreground/60 hover:text-muted-foreground transition-colors"
            title="Go back"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => router.history.forward()}
            className="p-1 text-muted-foreground/60 hover:text-muted-foreground transition-colors"
            title="Go forward"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Search input */}
      <div className="shrink-0 px-3 py-2">
        <div className="flex items-center gap-2 px-2.5 py-1.5 bg-muted/50 rounded-lg border border-border/30">
          <Search className="h-3.5 w-3.5 text-muted-foreground/50" />
          <input
            type="text"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            placeholder="Search..."
            className="flex-1 min-w-0 bg-transparent text-sm placeholder:text-muted-foreground/50 focus:outline-none"
          />
          {filterQuery && (
            <button
              onClick={() => setFilterQuery("")}
              className="p-0.5 text-muted-foreground/50 hover:text-muted-foreground"
            >
              <span className="text-xs">Clear</span>
            </button>
          )}
        </div>
      </div>

      {/* Content browser */}
      <div className="flex-1 overflow-y-auto px-3 pb-3">
        <NotebookSidebar
          filterQuery={filterQuery}
          onSelectItem={onSelectItem}
        />
      </div>
    </div>
  );
}

export default WorkbookBrowser;
