/**
 * DomainSidebar - Navigation sidebar with tables as first-class "sets"
 *
 * Each set (domain/table) is shown as a navigation item. Clicking a set
 * opens a tabbed view with Page, Sheet, and Actions tabs.
 *
 * Uses tRPC for domain data and provides CRUD actions via context menu.
 */

import { useNavigate, useParams } from "@tanstack/react-router";
import { Layers, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

export interface DomainSidebarProps {
  /** External filter query */
  filterQuery?: string;
}

export function DomainSidebar({ filterQuery }: DomainSidebarProps) {
  const navigate = useNavigate();
  const params = useParams({ strict: false });
  const currentDomainId = (params as { domainId?: string }).domainId;

  // Track newly created domain for auto-rename
  const [newlyCreatedId, setNewlyCreatedId] = useState<string | null>(null);

  // Domain data via tRPC (poll for live updates)
  const { data, isLoading } = trpc.domains.list.useQuery(undefined, {
    refetchInterval: 2000,
  });
  const utils = trpc.useUtils();

  // Filter domains by search query
  const domains = useMemo(() => {
    if (!data?.domains) return [];
    if (!filterQuery) return data.domains;

    const query = filterQuery.toLowerCase();
    return data.domains.filter(
      (d) => d.name.toLowerCase().includes(query) || d.id.toLowerCase().includes(query),
    );
  }, [data?.domains, filterQuery]);

  // Mutations
  const createMutation = trpc.domains.create.useMutation({
    onSuccess: (result) => {
      utils.domains.list.invalidate();
      utils.workbook.manifest.invalidate();
      // Set newly created ID for auto-rename mode
      setNewlyCreatedId(result.domainId);
      // Navigate to the new domain
      navigate({
        to: "/domains/$domainId",
        params: { domainId: result.domainId },
        search: { tab: "page" },
      } as any);
    },
  });

  const renameMutation = trpc.domains.rename.useMutation({
    onSuccess: () => {
      utils.domains.list.invalidate();
      utils.workbook.manifest.invalidate();
    },
  });

  const deleteMutation = trpc.domains.delete.useMutation({
    onSuccess: (result) => {
      utils.domains.list.invalidate();
      utils.workbook.manifest.invalidate();
      // Navigate away if we deleted the current domain
      if (result.deletedTable === currentDomainId) {
        navigate({ to: "/" });
      }
    },
  });

  const handleCreate = useCallback(() => {
    // Generate a unique name
    const baseName = "untitled";
    let name = baseName;
    let counter = 1;
    const existingNames = new Set(domains.map((d) => d.id));
    while (existingNames.has(name)) {
      name = `${baseName}_${counter}`;
      counter++;
    }
    createMutation.mutate({ name });
  }, [domains, createMutation]);

  const handleDomainClick = useCallback(
    (domainId: string) => {
      navigate({
        to: "/domains/$domainId",
        params: { domainId },
        search: { tab: "page" },
      } as any);
    },
    [navigate],
  );

  const handleRename = useCallback(
    async (domainId: string, newName: string) => {
      if (!newName.trim()) return;
      await renameMutation.mutateAsync({ domainId, newName: newName.trim() });
      // Navigate to renamed domain if it was current
      if (domainId === currentDomainId) {
        navigate({
          to: "/domains/$domainId",
          params: { domainId: newName.trim() },
          search: { tab: "page" },
        } as any);
      }
    },
    [renameMutation, currentDomainId, navigate],
  );

  const handleDelete = useCallback(
    async (domainId: string) => {
      await deleteMutation.mutateAsync({ domainId });
    },
    [deleteMutation],
  );

  return (
    <div className="space-y-1">
      {/* Header with title and create button */}
      <div className="flex items-center justify-between px-2 py-1">
        <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
          Sets
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={handleCreate}
              disabled={createMutation.isPending}
              className={cn(
                "p-0.5 rounded transition-colors",
                "text-muted-foreground/70 hover:text-foreground hover:bg-accent/50",
                "disabled:opacity-50",
              )}
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" className="text-[10px]">
            New set
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="px-2 py-6 text-center">
          <div className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            <div className="h-3 w-3 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
            Loading...
          </div>
        </div>
      ) : domains.length === 0 ? (
        <div className="px-2 py-4">
          {filterQuery ? (
            <div className="text-center text-xs text-muted-foreground">
              No sets matching "{filterQuery}"
            </div>
          ) : (
            <button
              onClick={handleCreate}
              disabled={createMutation.isPending}
              className={cn(
                "w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg",
                "border border-dashed border-border/60",
                "text-xs text-muted-foreground",
                "hover:bg-accent/50 hover:border-border hover:text-foreground",
                "transition-colors",
              )}
            >
              <Plus className="h-3.5 w-3.5" />
              Create your first set
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-0.5">
          {domains.map((domain) => (
            <DomainItem
              key={domain.id}
              domainId={domain.id}
              domainName={domain.name}
              isActive={currentDomainId === domain.id}
              autoEdit={newlyCreatedId === domain.id}
              onClearAutoEdit={() => setNewlyCreatedId(null)}
              onClick={() => handleDomainClick(domain.id)}
              onRename={handleRename}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface DomainItemProps {
  domainId: string;
  domainName: string;
  isActive: boolean;
  autoEdit?: boolean;
  onClearAutoEdit?: () => void;
  onClick: () => void;
  onRename: (domainId: string, newName: string) => Promise<void>;
  onDelete: (domainId: string) => Promise<void>;
}

/** Sanitize input to valid identifier: lowercase, underscores, no spaces */
function sanitizeIdentifier(input: string): string {
  return input
    .toLowerCase()
    .replace(/\s+/g, "_") // spaces to underscores
    .replace(/[^a-z0-9_]/g, "") // remove invalid chars
    .replace(/^[^a-z]+/, ""); // must start with letter
}

function DomainItem({
  domainId,
  domainName,
  isActive,
  autoEdit,
  onClearAutoEdit,
  onClick,
  onRename,
  onDelete,
}: DomainItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(domainId);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-enter edit mode for newly created domains
  useEffect(() => {
    if (autoEdit && !isEditing) {
      setEditValue(domainId);
      setIsEditing(true);
      onClearAutoEdit?.();
    }
  }, [autoEdit, isEditing, domainId, onClearAutoEdit]);

  // Focus input when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleStartEdit = useCallback(() => {
    setEditValue(domainId);
    setIsEditing(true);
    setMenuOpen(false);
  }, [domainId]);

  const handleCancelEdit = useCallback(() => {
    setIsEditing(false);
    setEditValue(domainId);
  }, [domainId]);

  const handleSubmitEdit = useCallback(async () => {
    const sanitized = sanitizeIdentifier(editValue);
    if (sanitized && sanitized !== domainId) {
      await onRename(domainId, sanitized);
    }
    setIsEditing(false);
  }, [editValue, domainId, onRename]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleSubmitEdit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        handleCancelEdit();
      }
    },
    [handleSubmitEdit, handleCancelEdit],
  );

  const handleConfirmDelete = useCallback(async () => {
    await onDelete(domainId);
    setShowDeleteDialog(false);
  }, [domainId, onDelete]);

  if (isEditing) {
    const sanitized = sanitizeIdentifier(editValue);
    const showPreview = editValue !== sanitized && sanitized.length > 0;

    return (
      <div className="flex items-center gap-2 px-2 py-1.5">
        <Layers className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
        <div className="flex-1 min-w-0">
          <input
            ref={inputRef}
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleSubmitEdit}
            className={cn(
              "w-full bg-transparent text-sm outline-none",
              "border-b border-primary focus:border-primary",
            )}
            placeholder="set_name"
          />
          {showPreview && (
            <div className="text-[10px] text-muted-foreground mt-0.5">
              → {sanitized}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        className={cn(
          "group w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-all",
          "hover:bg-accent/50",
          isActive && [
            "bg-background text-foreground",
            "shadow-sm shadow-black/5 dark:shadow-black/20",
            "ring-1 ring-border/50",
          ],
        )}
      >
        <button onClick={onClick} className="flex-1 flex items-center gap-2 min-w-0">
          <Layers
            className={cn(
              "h-4 w-4 flex-shrink-0",
              isActive ? "text-foreground" : "text-muted-foreground",
            )}
          />
          <span className="truncate text-sm">{domainName}</span>
        </button>

        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <button
              onClick={(e) => e.stopPropagation()}
              className={cn(
                "p-0.5 rounded transition-all",
                "opacity-0 group-hover:opacity-100",
                "hover:bg-accent",
              )}
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                handleStartEdit();
              }}
            >
              <Pencil className="h-3.5 w-3.5 mr-2" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                setShowDeleteDialog(true);
                setMenuOpen(false);
              }}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete set "{domainName}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the "{domainId}" table and its data. This action cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default DomainSidebar;
