/**
 * BlocksTree - Draggable tree view of blocks with folder support
 *
 * Supports drag-and-drop to move blocks between folders.
 * Uses ts-morph on the backend to update imports automatically.
 */

import { useState, useCallback, useMemo } from "react";
import { DndProvider, useDrag, useDrop } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";
import { SquaresFour } from "@phosphor-icons/react";
import { useMoveBlock } from "@/lib/blocks-client";
import type { WorkbookBlock } from "@/hooks/useWorkbook";

const BLOCK_DND_TYPE = "SIDEBAR_BLOCK";

interface DragItem {
  type: typeof BLOCK_DND_TYPE;
  blockId: string;
  parentDir: string;
}

interface BlocksTreeProps {
  blocks: WorkbookBlock[];
  searchQuery?: string;
  onBlockClick: (blockId: string) => void;
}

// Build tree from flat blocks list
function buildBlockTree(blocks: WorkbookBlock[]) {
  const tree: Map<string, WorkbookBlock[]> = new Map();
  const rootBlocks: WorkbookBlock[] = [];

  for (const block of blocks) {
    const parentDir = block.parentDir || "";
    if (!parentDir) {
      rootBlocks.push(block);
    } else {
      if (!tree.has(parentDir)) {
        tree.set(parentDir, []);
      }
      tree.get(parentDir)!.push(block);
    }
  }

  return { rootBlocks, directories: tree };
}

// Draggable block item
function DraggableBlock({
  block,
  onClick,
}: {
  block: WorkbookBlock;
  onClick: () => void;
}) {
  const [{ isDragging }, drag] = useDrag<DragItem, unknown, { isDragging: boolean }>(() => ({
    type: BLOCK_DND_TYPE,
    item: { type: BLOCK_DND_TYPE, blockId: block.id, parentDir: block.parentDir },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  }), [block.id, block.parentDir]);

  return (
    <button
      ref={drag as unknown as React.Ref<HTMLButtonElement>}
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-2 py-0.5 text-[13px] transition-all duration-150 origin-left",
        "text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing",
        isDragging && "opacity-50"
      )}
    >
      <SquaresFour weight="duotone" className="h-3.5 w-3.5 shrink-0" />
      <span className="flex-1 truncate text-left">{block.title || block.id}</span>
    </button>
  );
}

// Droppable folder
function DroppableFolder({
  dir,
  blocks,
  isExpanded,
  onToggle,
  onBlockClick,
  onDrop,
}: {
  dir: string;
  blocks: WorkbookBlock[];
  isExpanded: boolean;
  onToggle: () => void;
  onBlockClick: (blockId: string) => void;
  onDrop: (blockId: string, targetDir: string) => void;
}) {
  const [{ isOver, canDrop }, drop] = useDrop<DragItem, unknown, { isOver: boolean; canDrop: boolean }>(() => ({
    accept: BLOCK_DND_TYPE,
    canDrop: (item) => {
      // Can't drop into the same folder
      return item.parentDir !== dir;
    },
    drop: (item) => {
      onDrop(item.blockId, dir);
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
      canDrop: monitor.canDrop(),
    }),
  }), [dir, onDrop]);

  return (
    <div ref={drop as unknown as React.Ref<HTMLDivElement>}>
      <button
        onClick={onToggle}
        className={cn(
          "w-full flex items-center gap-1.5 py-0.5 text-[13px] text-muted-foreground/70 hover:text-foreground transition-colors",
          isOver && canDrop && "bg-accent/50 rounded"
        )}
      >
        <ChevronRight className={cn(
          "h-3 w-3 shrink-0 transition-transform",
          isExpanded && "rotate-90"
        )} />
        <span className="flex-1 truncate text-left">{dir}</span>
        <span className="text-[10px] text-muted-foreground/40">{blocks.length}</span>
      </button>
      {isExpanded && (
        <div className="ml-3 border-l border-border/30 pl-2">
          {blocks.map((block) => (
            <DraggableBlock
              key={block.id}
              block={block}
              onClick={() => onBlockClick(block.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Droppable root area (for moving blocks to root)
function DroppableRoot({
  blocks,
  onBlockClick,
  onDrop,
}: {
  blocks: WorkbookBlock[];
  onBlockClick: (blockId: string) => void;
  onDrop: (blockId: string) => void;
}) {
  const [{ isOver, canDrop }, drop] = useDrop<DragItem, unknown, { isOver: boolean; canDrop: boolean }>(() => ({
    accept: BLOCK_DND_TYPE,
    canDrop: (item) => {
      // Can't drop if already at root
      return item.parentDir !== "";
    },
    drop: (item) => {
      onDrop(item.blockId);
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
      canDrop: monitor.canDrop(),
    }),
  }), [onDrop]);

  if (blocks.length === 0) return null;

  return (
    <div
      ref={drop as unknown as React.Ref<HTMLDivElement>}
      className={cn(
        "transition-colors rounded",
        isOver && canDrop && "bg-accent/50"
      )}
    >
      {blocks.map((block) => (
        <DraggableBlock
          key={block.id}
          block={block}
          onClick={() => onBlockClick(block.id)}
        />
      ))}
    </div>
  );
}

// Inner tree component (needs DndProvider wrapper)
function BlocksTreeInner({ blocks, searchQuery = "", onBlockClick }: BlocksTreeProps) {
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const { move } = useMoveBlock();

  const blockTree = useMemo(() => buildBlockTree(blocks), [blocks]);

  const toggleDir = useCallback((dir: string) => {
    setExpandedDirs(prev => {
      const next = new Set(prev);
      if (next.has(dir)) {
        next.delete(dir);
      } else {
        next.add(dir);
      }
      return next;
    });
  }, []);

  const handleMove = useCallback(async (blockId: string, targetDir: string) => {
    // Extract just the filename from the full block ID
    const filename = blockId.includes("/") ? blockId.split("/").pop()! : blockId;
    const newId = targetDir ? `${targetDir}/${filename}` : filename;

    if (blockId === newId) return;

    const result = await move(blockId, newId);
    if (!result.success) {
      console.error("Failed to move block:", result.error);
      // Could show a toast here
    }
  }, [move]);

  const handleMoveToRoot = useCallback((blockId: string) => {
    handleMove(blockId, "");
  }, [handleMove]);

  // Filter blocks if searching
  const filteredTree = useMemo(() => {
    if (!searchQuery) return blockTree;

    const query = searchQuery.toLowerCase();
    const filteredRootBlocks = blockTree.rootBlocks.filter(b =>
      b.title.toLowerCase().includes(query)
    );

    const filteredDirs = new Map<string, WorkbookBlock[]>();
    for (const [dir, dirBlocks] of blockTree.directories) {
      const filtered = dirBlocks.filter(b => b.title.toLowerCase().includes(query));
      if (filtered.length > 0) {
        filteredDirs.set(dir, filtered);
      }
    }

    return { rootBlocks: filteredRootBlocks, directories: filteredDirs };
  }, [blockTree, searchQuery]);

  if (blocks.length === 0) {
    return (
      <div className="flex items-center gap-2 py-1 text-[11px] text-muted-foreground/70">
        <SquaresFour weight="duotone" className="h-3.5 w-3.5" />
        <span>No blocks</span>
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {/* Directories first */}
      {Array.from(filteredTree.directories.keys()).sort().map((dir) => {
        const dirBlocks = filteredTree.directories.get(dir) || [];
        const isExpanded = expandedDirs.has(dir) || !!searchQuery;

        return (
          <DroppableFolder
            key={dir}
            dir={dir}
            blocks={dirBlocks}
            isExpanded={isExpanded}
            onToggle={() => toggleDir(dir)}
            onBlockClick={onBlockClick}
            onDrop={handleMove}
          />
        );
      })}

      {/* Root blocks */}
      <DroppableRoot
        blocks={filteredTree.rootBlocks}
        onBlockClick={onBlockClick}
        onDrop={handleMoveToRoot}
      />
    </div>
  );
}

// Export with DndProvider wrapper
export function BlocksTree(props: BlocksTreeProps) {
  return (
    <DndProvider backend={HTML5Backend}>
      <BlocksTreeInner {...props} />
    </DndProvider>
  );
}
