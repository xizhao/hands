/**
 * LandingSidebar - Workbook list for sidebar (v0-style)
 *
 * Uses IndexedDB cache for listing. Source of truth is SQLite.
 * When creating a workbook, we create the cache entry and navigate.
 * SQLite database is opened on navigation to the workbook route.
 */

// Use lightweight imports to avoid pulling in heavy @hands/app deps
import { Spinner, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@hands/app/light";
import { MoreHorizontal, NotebookPen, Plus, Trash2 } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import {
  createWorkbookCache,
  deleteWorkbookCache,
  listWorkbooks,
  type WorkbookCache,
} from "../shared/lib/storage";

interface LandingSidebarProps {
  onWorkbooksChange?: (count: number) => void;
}

export function LandingSidebar({ onWorkbooksChange }: LandingSidebarProps) {
  const navigate = useNavigate();
  const [workbooks, setWorkbooks] = useState<WorkbookCache[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load workbooks from cache
  useEffect(() => {
    listWorkbooks()
      .then((list) => {
        setWorkbooks(list);
        onWorkbooksChange?.(list.length);
      })
      .finally(() => setIsLoading(false));
  }, [onWorkbooksChange]);

  // Navigate to workbook root - don't preserve child routes like /tables/x or /pages/y
  const handleSwitchWorkbook = useCallback(
    (id: string) => {
      navigate({ to: `/w/${id}` });
    },
    [navigate]
  );

  const handleCreateWorkbook = useCallback(async () => {
    // Create cache entry first, SQLite db is created when workbook opens
    const workbook = await createWorkbookCache("Untitled Workbook");
    setWorkbooks((prev) => {
      const updated = [workbook, ...prev];
      onWorkbooksChange?.(updated.length);
      return updated;
    });
    navigate({ to: "/w/$workbookId", params: { workbookId: workbook.id } });
  }, [navigate, onWorkbooksChange]);

  const handleDeleteWorkbook = useCallback(
    async (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (!confirm("Delete this workbook? This cannot be undone.")) return;
      await deleteWorkbookCache(id);
      setWorkbooks((prev) => {
        const updated = prev.filter((w) => w.id !== id);
        onWorkbooksChange?.(updated.length);
        return updated;
      });
    },
    [onWorkbooksChange]
  );

  return (
    <div className="flex flex-col h-full">
      {/* New Workbook button - top */}
      <div className="p-3 shrink-0">
        <button
          onClick={handleCreateWorkbook}
          className="w-full flex items-center gap-2 px-3 py-2 border border-border rounded-lg text-sm font-medium hover:bg-accent/50 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Workbook
        </button>
      </div>

      {/* Workbook list */}
      <div className="flex-1 overflow-y-auto px-2">
        {!isLoading && workbooks.length > 0 && (
          <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
            Recent
          </div>
        )}
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Spinner size="sm" />
          </div>
        ) : workbooks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <NotebookPen className="h-8 w-8 mb-2 opacity-50" />
            <p className="text-sm">No workbooks yet</p>
            <p className="text-xs mt-1">Create one to get started</p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {workbooks.map((wb) => (
              <div
                key={wb.id}
                onClick={() => handleSwitchWorkbook(wb.id)}
                className="group relative flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover:bg-accent/50 transition-colors"
              >
                <span className="flex-1 min-w-0 text-sm truncate">
                  {wb.name}
                </span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      onClick={(e) => e.stopPropagation()}
                      className="p-1 rounded opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground hover:bg-accent transition-all"
                    >
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-[140px]">
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteWorkbook(wb.id, e as unknown as React.MouseEvent);
                      }}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
