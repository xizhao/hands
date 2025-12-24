/**
 * BlocksPanel - Shows embeddable blocks from pages/blocks/ subfolder
 *
 * Blocks are MDX fragments that can be embedded into pages using:
 * <Block src="blocks/header" />
 */

import { CircleNotch, Cube, Plus, File } from "@phosphor-icons/react";
import { useRouter } from "@tanstack/react-router";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

interface BlockItemProps {
  route: string;
  path: string;
  onClick: () => void;
}

function BlockItem({ route, path, onClick }: BlockItemProps) {
  // Extract display name from path (e.g., "blocks/header.mdx" -> "header")
  const displayName = path
    .replace(/^blocks\//, "")
    .replace(/\.mdx?$/, "")
    .replace(/-/g, " ");

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-2 px-2 py-1.5 rounded-md",
        "text-sm text-left hover:bg-accent transition-colors group",
      )}
    >
      <File weight="duotone" className="h-4 w-4 text-blue-400 shrink-0" />
      <span className="flex-1 truncate capitalize">{displayName}</span>
    </button>
  );
}

export function BlocksPanel() {
  const router = useRouter();
  const utils = trpc.useUtils();

  const { data, isLoading, error } = trpc.pages.listBlocks.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  const createPageMutation = trpc.pages.create.useMutation({
    onSuccess: (result) => {
      // Invalidate queries to refresh the list
      utils.pages.listBlocks.invalidate();
      utils.pages.list.invalidate();
      utils.workbook.manifest.invalidate();
      // Navigate to the new block
      router.navigate({
        to: "/pages/$pageId",
        params: { pageId: result.pageId },
      });
    },
  });

  const handleOpenBlock = (route: string) => {
    // Route is like "/blocks/header", we need "blocks/header" for the page param
    const pageId = route.startsWith("/") ? route.slice(1) : route;
    router.navigate({
      to: "/pages/$pageId",
      params: { pageId },
    });
  };

  const handleCreateBlock = () => {
    // Generate unique block name
    const existingBlocks = data?.blocks ?? [];
    let baseName = "untitled";
    let counter = 0;
    let blockId = `blocks/${baseName}`;

    // Check for conflicts with existing blocks
    while (existingBlocks.some(b => b.path === `${blockId.replace("blocks/", "blocks/")}.mdx`)) {
      counter++;
      blockId = `blocks/${baseName}-${counter}`;
    }

    createPageMutation.mutate({ pageId: blockId });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <CircleNotch weight="bold" className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-sm text-destructive">
        Failed to load blocks: {error.message}
      </div>
    );
  }

  const blocks = data?.blocks ?? [];
  const hasBlocks = blocks.length > 0;

  return (
    <div className="p-2 space-y-4">
      {/* Header with Add button */}
      <div className="flex items-center justify-between px-2">
        <div className="text-xs font-medium text-muted-foreground">Blocks</div>
        <button
          onClick={handleCreateBlock}
          disabled={createPageMutation.isPending}
          className={cn(
            "flex items-center gap-1.5 px-2 py-1 rounded-md text-xs",
            "text-muted-foreground hover:text-foreground hover:bg-accent transition-colors",
            createPageMutation.isPending && "opacity-50 cursor-not-allowed",
          )}
        >
          {createPageMutation.isPending ? (
            <CircleNotch weight="bold" className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plus weight="bold" className="h-3.5 w-3.5" />
          )}
          New Block
        </button>
      </div>

      {/* Blocks List */}
      {hasBlocks ? (
        <div className="space-y-1">
          {blocks.map((block) => (
            <BlockItem
              key={block.route}
              route={block.route}
              path={block.path}
              onClick={() => handleOpenBlock(block.route)}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-6 text-center px-2">
          <Cube weight="duotone" className="h-8 w-8 text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground">No blocks yet</p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            Create reusable MDX fragments in pages/blocks/
          </p>
        </div>
      )}

      {/* Usage hint */}
      {hasBlocks && (
        <div className="px-2 pt-2 border-t border-border">
          <div className="text-xs text-muted-foreground">
            <span className="font-medium">Usage:</span>{" "}
            <code className="bg-muted px-1 py-0.5 rounded text-[10px]">
              {"<Block src=\"blocks/name\" />"}
            </code>
          </div>
        </div>
      )}
    </div>
  );
}
