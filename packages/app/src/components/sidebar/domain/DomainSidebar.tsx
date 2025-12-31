/**
 * DomainSidebar - Navigation sidebar with tables as first-class "domains"
 *
 * Each domain (table) is shown as a navigation item. Clicking a domain
 * opens a tabbed view with Page, Sheet, and Actions tabs.
 *
 * Uses tRPC for domain data and provides CRUD actions via context menu.
 */

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { FileText, Plus, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

export interface DomainSidebarProps {
  /** External filter query */
  filterQuery?: string;
  /** Callback to open add source dialog */
  onAddSource?: () => void;
}

export function DomainSidebar({ filterQuery, onAddSource }: DomainSidebarProps) {
  const navigate = useNavigate();
  const params = useParams({ strict: false });
  const currentDomainId = (params as { domainId?: string }).domainId;

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
      (d) =>
        d.name.toLowerCase().includes(query) ||
        d.id.toLowerCase().includes(query)
    );
  }, [data?.domains, filterQuery]);

  // Mutations
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

  const handleDomainClick = useCallback(
    (domainId: string) => {
      navigate({
        to: "/domains/$domainId",
        params: { domainId },
        search: { tab: "page" },
      } as any);
    },
    [navigate]
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
    [renameMutation, currentDomainId, navigate]
  );

  const handleDelete = useCallback(
    async (domainId: string) => {
      await deleteMutation.mutateAsync({ domainId });
    },
    [deleteMutation]
  );

  return (
    <div className="space-y-0.5">
      {isLoading ? (
        <div className="px-2 py-8 text-center">
          <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <div className="h-3 w-3 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
            Loading...
          </div>
        </div>
      ) : domains.length === 0 ? (
        <div className="px-3 py-6">
          {filterQuery ? (
            <div className="text-center text-sm text-muted-foreground">
              No domains matching "{filterQuery}"
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-center text-sm text-muted-foreground">
                No data found. Add a source to get started.
              </div>
              {onAddSource && (
                <button
                  onClick={onAddSource}
                  className={cn(
                    "w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg",
                    "border border-dashed border-border/60",
                    "text-sm text-muted-foreground",
                    "hover:bg-accent/50 hover:border-border hover:text-foreground",
                    "transition-colors"
                  )}
                >
                  <Plus className="h-4 w-4" />
                  Add source
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        domains.map((domain) => (
          <DomainItem
            key={domain.id}
            domainId={domain.id}
            domainName={domain.name}
            isActive={currentDomainId === domain.id}
            onClick={() => handleDomainClick(domain.id)}
            onRename={handleRename}
            onDelete={handleDelete}
          />
        ))
      )}
    </div>
  );
}

interface DomainItemProps {
  domainId: string;
  domainName: string;
  isActive: boolean;
  onClick: () => void;
  onRename: (domainId: string, newName: string) => Promise<void>;
  onDelete: (domainId: string) => Promise<void>;
}

function DomainItem({
  domainId,
  domainName,
  isActive,
  onClick,
  onRename,
  onDelete,
}: DomainItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(domainId);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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
    if (editValue.trim() && editValue.trim() !== domainId) {
      await onRename(domainId, editValue.trim());
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
    [handleSubmitEdit, handleCancelEdit]
  );

  const handleConfirmDelete = useCallback(async () => {
    await onDelete(domainId);
    setShowDeleteDialog(false);
  }, [domainId, onDelete]);

  if (isEditing) {
    return (
      <div className="flex items-center gap-2 px-2 py-1">
        <FileText className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
        <input
          ref={inputRef}
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleSubmitEdit}
          className={cn(
            "flex-1 bg-transparent text-sm outline-none",
            "border-b border-primary focus:border-primary"
          )}
          placeholder="domain_name"
        />
      </div>
    );
  }

  return (
    <>
      <div
        className={cn(
          "group w-full flex items-center gap-2 px-2 py-1 rounded-md text-left transition-colors",
          "hover:bg-accent/50",
          isActive && "bg-accent text-accent-foreground"
        )}
      >
        <button onClick={onClick} className="flex-1 flex items-center gap-2 min-w-0">
          <FileText
            className={cn(
              "h-4 w-4 flex-shrink-0",
              isActive ? "text-foreground" : "text-muted-foreground"
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
                "hover:bg-accent"
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
            <AlertDialogTitle>Delete domain "{domainName}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the "{domainId}" table and its associated page.
              This action cannot be undone.
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
