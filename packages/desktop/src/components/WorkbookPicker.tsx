import { useState } from "react";
import { useWorkbooks, useCreateWorkbook, useDeleteWorkbook, useOpenWorkbook } from "@/hooks/useWorkbook";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FolderOpen, Plus, MoreVertical, Trash2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Workbook } from "@/lib/workbook";
import { NewWorkbookModal } from "@/components/NewWorkbookModal";

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) {
    return "Today";
  } else if (days === 1) {
    return "Yesterday";
  } else if (days < 7) {
    return `${days} days ago`;
  } else {
    return date.toLocaleDateString();
  }
}

function WorkbookCard({
  workbook,
  onSelect,
  onDelete,
}: {
  workbook: Workbook;
  onSelect: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      onClick={onSelect}
      className={cn(
        "group relative p-4 rounded-lg border border-border",
        "bg-background hover:bg-muted/50 cursor-pointer transition-colors"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <FolderOpen className="h-4 w-4 text-muted-foreground shrink-0" />
            <h3 className="font-medium text-sm truncate">{workbook.name}</h3>
          </div>
          {workbook.description && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
              {workbook.description}
            </p>
          )}
          <p className="text-xs text-muted-foreground mt-2">
            Last opened {formatDate(workbook.last_opened_at)}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

export function WorkbookPicker() {
  const { data: workbooks = [], isLoading } = useWorkbooks();
  const createWorkbook = useCreateWorkbook();
  const deleteWorkbook = useDeleteWorkbook();
  const openWorkbook = useOpenWorkbook();
  const [showNewDialog, setShowNewDialog] = useState(false);

  const handleSelectWorkbook = (workbook: Workbook) => {
    openWorkbook.mutate(workbook);
  };

  const handleCreateWorkbook = (name: string, description?: string, templateId?: string) => {
    createWorkbook.mutate(
      { name, description },
      {
        onSuccess: (workbook) => {
          openWorkbook.mutate(workbook);
          setShowNewDialog(false);
          // TODO: Apply template if templateId is provided
          if (templateId) {
            console.log(`Applying template: ${templateId}`);
          }
        },
      }
    );
  };

  const handleDeleteWorkbook = (id: string) => {
    deleteWorkbook.mutate(id);
  };

  return (
    <div className="h-full flex flex-col items-center justify-center p-8 bg-background">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold mb-2">Welcome to Hands</h1>
          <p className="text-muted-foreground">
            Select a workbook to continue or create a new one
          </p>
        </div>

        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">Your Workbooks</h2>
          <Button
            variant="outline"
            size="xs"
            onClick={() => setShowNewDialog(true)}
            disabled={createWorkbook.isPending}
          >
            <Plus className="h-4 w-4 mr-2" />
            New Workbook
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : workbooks.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-border rounded-lg">
            <FolderOpen className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
            <h3 className="text-sm font-medium mb-1">No workbooks yet</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Create your first workbook to get started
            </p>
            <Button onClick={() => setShowNewDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Workbook
            </Button>
          </div>
        ) : (
          <ScrollArea className="h-[400px]">
            <div className="grid gap-3">
              {workbooks.map((workbook) => (
                <WorkbookCard
                  key={workbook.id}
                  workbook={workbook}
                  onSelect={() => handleSelectWorkbook(workbook)}
                  onDelete={() => handleDeleteWorkbook(workbook.id)}
                />
              ))}
            </div>
          </ScrollArea>
        )}
      </div>

      <NewWorkbookModal
        open={showNewDialog}
        onOpenChange={setShowNewDialog}
        onCreate={handleCreateWorkbook}
        isCreating={createWorkbook.isPending}
      />
    </div>
  );
}
