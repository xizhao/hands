/**
 * Shared Header Component
 *
 * Shared navigation header between site and app.
 * Contains Hands logo and workbook switcher.
 */

import { cn } from "@hands/app/lib/utils";
import { Check, ChevronDown, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
  createWorkbook,
  deleteWorkbook,
  getWorkbookIdFromUrl,
  listWorkbooks,
  type WorkbookMeta,
} from "../lib/storage";

export function Header({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  const [workbooks, setWorkbooks] = useState<WorkbookMeta[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const currentWorkbookId = getWorkbookIdFromUrl();
  const currentWorkbook = workbooks.find((w) => w.id === currentWorkbookId);

  useEffect(() => {
    listWorkbooks().then(setWorkbooks);
  }, []);

  const handleSwitchWorkbook = (id: string) => {
    window.location.href = `/w/${id}`;
  };

  const handleCreateWorkbook = async () => {
    const workbook = await createWorkbook("New Workbook");
    window.location.href = `/w/${workbook.id}`;
  };

  const handleDeleteWorkbook = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm("Delete this workbook? This cannot be undone.")) return;

    await deleteWorkbook(id);
    const remaining = workbooks.filter((w) => w.id !== id);
    setWorkbooks(remaining);

    // If we deleted the current workbook, navigate away
    if (id === currentWorkbookId) {
      if (remaining.length > 0) {
        window.location.href = `/w/${remaining[0].id}`;
      } else {
        window.location.href = "/";
      }
    }
  };

  // Only show switcher if there are workbooks
  const hasWorkbooks = workbooks.length > 0;

  return (
    <header
      className={cn(
        "h-10 shrink-0 flex items-center gap-4 px-4 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 relative z-50",
        className
      )}
    >
      {/* Logo */}
      <a
        href="/"
        className="flex items-center gap-2 text-foreground hover:text-foreground/80 transition-colors"
      >
        <HandsLogo className="w-4 h-4" />
        <span className="font-semibold text-sm">Hands</span>
      </a>

      {/* Workbook switcher - show if workbooks exist */}
      {hasWorkbooks && (
        <div className="relative">
          <button
            onClick={() => setIsOpen(!isOpen)}
            onBlur={() => setTimeout(() => setIsOpen(false), 150)}
            className="flex items-center gap-1.5 px-2 py-1 mt-0.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
          >
            <span className="max-w-[200px] truncate">
              {currentWorkbook?.name ?? "Select workbook"}
            </span>
            <ChevronDown className="h-3.5 w-3.5" />
          </button>

          {isOpen && (
            <div className="absolute top-full left-0 mt-1.5 w-56 py-1 bg-popover border border-border rounded-lg shadow-lg z-50">
              {workbooks.map((wb) => (
                <div
                  key={wb.id}
                  className="group flex items-center hover:bg-accent/50 transition-colors"
                >
                  <button
                    onClick={() => handleSwitchWorkbook(wb.id)}
                    className="flex-1 flex items-center justify-between px-3 py-1.5 text-sm text-left"
                  >
                    <span className="truncate">{wb.name}</span>
                    {wb.id === currentWorkbookId && (
                      <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                    )}
                  </button>
                  <button
                    onClick={(e) => handleDeleteWorkbook(e, wb.id)}
                    className="p-1.5 mr-1 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
                    title="Delete workbook"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <div className="border-t border-border my-1" />
              <button
                onClick={handleCreateWorkbook}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-accent/50 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                New Notebook
              </button>
            </div>
          )}
        </div>
      )}

      {/* Spacer + children on right */}
      <div className="flex-1" />
      {children && <div className="flex items-center gap-2">{children}</div>}
    </header>
  );
}

function HandsLogo({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2" />
      <path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2" />
      <path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8" />
      <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
    </svg>
  );
}

export { HandsLogo };
