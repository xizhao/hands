/**
 * BlocksPanel - Shows blocks (charts and insights) via SSE manifest
 * Groups blocks by folder (parentDir)
 */

import { useMemo, useState } from "react";
import { useManifest, type WorkbookBlock } from "@/hooks/useWorkbook";
import { SquaresFour, CaretRight, Sparkle, Plus, ArrowSquareOut } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";

// Group blocks by parentDir
function groupBlocksByFolder(blocks: WorkbookBlock[]): Map<string, WorkbookBlock[]> {
  const groups = new Map<string, WorkbookBlock[]>();

  for (const block of blocks) {
    const folder = block.parentDir || "";
    if (!groups.has(folder)) {
      groups.set(folder, []);
    }
    groups.get(folder)!.push(block);
  }

  // Sort folders (root first, then alphabetically)
  return new Map(
    [...groups.entries()].sort((a, b) => {
      if (a[0] === "") return -1;
      if (b[0] === "") return 1;
      return a[0].localeCompare(b[0]);
    })
  );
}

export function BlocksPanel() {
  const { data: manifest } = useManifest();
  const navigate = useNavigate();
  const blocks = manifest?.blocks ?? [];
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());

  // Group blocks by folder
  const groupedBlocks = useMemo(() => groupBlocksByFolder(blocks), [blocks]);

  const toggleDir = (dir: string) => {
    setExpandedDirs(prev => {
      const next = new Set(prev);
      if (next.has(dir)) {
        next.delete(dir);
      } else {
        next.add(dir);
      }
      return next;
    });
  };

  // Loading handled by useManifest - manifest will be undefined initially
  if (!manifest) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        Loading blocks...
      </div>
    );
  }

  return (
    <div className="p-2">
      {/* Header with actions */}
      <div className="flex items-center justify-between px-2 py-1 mb-2">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Blocks
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => navigate({ to: "/blocks" })}
            className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            title="View all blocks"
          >
            <ArrowSquareOut weight="bold" className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => navigate({ to: "/blocks/$blockId", params: { blockId: "new" } })}
            className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            title="Create new block"
          >
            <Plus weight="bold" className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {blocks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <SquaresFour weight="duotone" className="h-8 w-8 text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground">No blocks yet</p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            Create charts and insights in your workbook
          </p>
          <button
            onClick={() => navigate({ to: "/blocks/$blockId", params: { blockId: "new" } })}
            className={cn(
              "mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs",
              "bg-primary text-primary-foreground hover:bg-primary/90",
              "transition-colors"
            )}
          >
            <Plus weight="bold" className="h-3 w-3" />
            Create Block
          </button>
        </div>
      ) : (
        <div className="space-y-0.5">
          {[...groupedBlocks.entries()].map(([folder, folderBlocks]) => {
            const isExpanded = expandedDirs.has(folder);

            // Root blocks (no folder)
            if (!folder) {
              return folderBlocks.map((block) => (
                <button
                  key={block.id}
                  onClick={() => navigate({ to: "/blocks/$blockId", params: { blockId: block.id } })}
                  className={cn(
                    "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left",
                    "text-sm text-foreground hover:bg-accent transition-colors"
                  )}
                >
                  <Sparkle weight="duotone" className="h-4 w-4 text-purple-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="truncate">{block.title}</div>
                    {block.description && (
                      <div className="text-xs text-muted-foreground truncate">
                        {block.description}
                      </div>
                    )}
                  </div>
                  <CaretRight weight="bold" className="h-3 w-3 text-muted-foreground/50 shrink-0" />
                </button>
              ));
            }

            // Folder with blocks
            return (
              <div key={folder}>
                <button
                  onClick={() => toggleDir(folder)}
                  className="w-full flex items-center gap-1.5 px-2 py-1 text-sm text-muted-foreground/70 hover:text-foreground transition-colors"
                >
                  <ChevronRight className={cn(
                    "h-3 w-3 shrink-0 transition-transform",
                    isExpanded && "rotate-90"
                  )} />
                  <span className="flex-1 truncate text-left">{folder}</span>
                  <span className="text-[10px] text-muted-foreground/40">{folderBlocks.length}</span>
                </button>
                {isExpanded && (
                  <div className="ml-3 border-l border-border/30 pl-2">
                    {folderBlocks.map((block) => (
                      <button
                        key={block.id}
                        onClick={() => navigate({ to: "/blocks/$blockId", params: { blockId: block.id } })}
                        className={cn(
                          "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left",
                          "text-sm text-foreground hover:bg-accent transition-colors"
                        )}
                      >
                        <Sparkle weight="duotone" className="h-4 w-4 text-purple-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="truncate">{block.title}</div>
                          {block.description && (
                            <div className="text-xs text-muted-foreground truncate">
                              {block.description}
                            </div>
                          )}
                        </div>
                        <CaretRight weight="bold" className="h-3 w-3 text-muted-foreground/50 shrink-0" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
