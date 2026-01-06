/**
 * LandingSidebar - Workbook list for sidebar (v0-style)
 */

import { Spinner } from "@hands/app";
import { MoreHorizontal, NotebookPen, Pencil, Plus, Trash2 } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  createWorkbook,
  deleteWorkbook,
  listWorkbooks,
  renameWorkbook,
  type WorkbookMeta,
} from "../shared/lib/storage";

interface LandingSidebarProps {
  onWorkbooksChange?: (count: number) => void;
}

export function LandingSidebar({ onWorkbooksChange }: LandingSidebarProps) {
  const navigate = useNavigate();
  const [workbooks, setWorkbooks] = useState<WorkbookMeta[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Load workbooks
  useEffect(() => {
    listWorkbooks()
      .then((list) => {
        setWorkbooks(list);
        onWorkbooksChange?.(list.length);
      })
      .finally(() => setIsLoading(false));
  }, [onWorkbooksChange]);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpenId) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenId(null);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpenId]);

  const handleSwitchWorkbook = useCallback(
    (id: string) => {
      navigate({ to: "/w/$workbookId", params: { workbookId: id } });
    },
    [navigate]
  );

  const handleCreateWorkbook = useCallback(async () => {
    const workbook = await createWorkbook("Untitled Workbook");
    setWorkbooks((prev) => {
      const updated = [workbook, ...prev];
      onWorkbooksChange?.(updated.length);
      return updated;
    });
    navigate({ to: "/w/$workbookId", params: { workbookId: workbook.id } });
  }, [navigate, onWorkbooksChange]);

  const handleRenameWorkbook = useCallback(
    async (id: string, currentName: string) => {
      const newName = prompt("Rename workbook:", currentName);
      if (!newName || newName.trim() === currentName) {
        setMenuOpenId(null);
        return;
      }
      setMenuOpenId(null);
      const updated = await renameWorkbook(id, newName.trim());
      if (updated) {
        setWorkbooks((prev) =>
          prev.map((w) => (w.id === id ? updated : w))
        );
      }
    },
    []
  );

  const handleDeleteWorkbook = useCallback(
    async (id: string) => {
      if (!confirm("Delete this workbook? This cannot be undone.")) return;
      setMenuOpenId(null);
      await deleteWorkbook(id);
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
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpenId(menuOpenId === wb.id ? null : wb.id);
                  }}
                  className="p-1 rounded opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-all"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button>

                {/* Dropdown menu */}
                {menuOpenId === wb.id && (
                  <div
                    ref={menuRef}
                    className="absolute right-0 top-full mt-1 z-50 min-w-[120px] py-1 bg-popover border border-border rounded-md shadow-lg"
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRenameWorkbook(wb.id, wb.name);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent/50 transition-colors"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Rename
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteWorkbook(wb.id);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-destructive hover:bg-accent/50 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
