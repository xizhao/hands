/**
 * Blocks List Route - /blocks
 *
 * Shows all blocks in the current workbook with create/edit options.
 */

import { createRoute, Link } from "@tanstack/react-router";
import { notebookRoute } from "../../_notebook";
import { useRuntime } from "@/providers/RuntimeProvider";
import { cn } from "@/lib/utils";
import {
  Plus,
  Sparkle,
  ArrowRight,
  MagnifyingGlass,
  Code,
} from "@phosphor-icons/react";
import { useState } from "react";

export const blocksIndexRoute = createRoute({
  getParentRoute: () => notebookRoute,
  path: "/blocks",
  component: BlocksListPage,
});

function BlocksListPage() {
  const { manifest, isReady } = useRuntime();
  const blocks = manifest?.blocks ?? [];
  const [search, setSearch] = useState("");

  // Filter blocks by search
  const filteredBlocks = blocks.filter(
    (block) =>
      block.title.toLowerCase().includes(search.toLowerCase()) ||
      block.id.toLowerCase().includes(search.toLowerCase()) ||
      block.description?.toLowerCase().includes(search.toLowerCase())
  );

  if (!isReady) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div>
          <h1 className="text-xl font-semibold">Blocks</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Visual components for your workbook
          </p>
        </div>
        <Link
          to="/blocks/$blockId"
          params={{ blockId: "new" }}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-md text-sm",
            "bg-primary text-primary-foreground hover:bg-primary/90",
            "transition-colors"
          )}
        >
          <Plus weight="bold" className="h-4 w-4" />
          New Block
        </Link>
      </div>

      {/* Search */}
      <div className="px-6 py-3 border-b">
        <div className="relative max-w-md">
          <MagnifyingGlass
            weight="bold"
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
          />
          <input
            type="text"
            placeholder="Search blocks..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={cn(
              "w-full h-9 pl-9 pr-4 rounded-md border border-input bg-background text-sm",
              "focus:outline-none focus:ring-2 focus:ring-ring"
            )}
          />
        </div>
      </div>

      {/* Blocks grid */}
      <div className="flex-1 overflow-auto p-6">
        {filteredBlocks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Sparkle
              weight="duotone"
              className="h-12 w-12 text-muted-foreground/30 mb-4"
            />
            {search ? (
              <>
                <p className="text-muted-foreground">No blocks match "{search}"</p>
                <button
                  onClick={() => setSearch("")}
                  className="text-sm text-primary mt-2 hover:underline"
                >
                  Clear search
                </button>
              </>
            ) : (
              <>
                <p className="text-muted-foreground">No blocks yet</p>
                <p className="text-sm text-muted-foreground/70 mt-1">
                  Create your first block to get started
                </p>
                <Link
                  to="/blocks/$blockId"
                  params={{ blockId: "new" }}
                  className={cn(
                    "mt-4 flex items-center gap-2 px-4 py-2 rounded-md text-sm",
                    "bg-primary text-primary-foreground hover:bg-primary/90",
                    "transition-colors"
                  )}
                >
                  <Plus weight="bold" className="h-4 w-4" />
                  Create Block
                </Link>
              </>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredBlocks.map((block) => (
              <BlockCard key={block.id} block={block} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface BlockCardProps {
  block: {
    id: string;
    title: string;
    path: string;
    description?: string;
  };
}

function BlockCard({ block }: BlockCardProps) {
  return (
    <Link
      to="/blocks/$blockId"
      params={{ blockId: block.id }}
      className={cn(
        "group flex flex-col p-4 rounded-lg border bg-card",
        "hover:border-primary/50 hover:shadow-md transition-all"
      )}
    >
      {/* Icon and title */}
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-md bg-purple-500/10">
          <Sparkle weight="duotone" className="h-5 w-5 text-purple-500" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-foreground truncate">{block.title}</h3>
          <p className="text-xs text-muted-foreground font-mono mt-0.5">
            {block.id}
          </p>
        </div>
        <ArrowRight
          weight="bold"
          className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
        />
      </div>

      {/* Description */}
      {block.description && (
        <p className="text-sm text-muted-foreground mt-3 line-clamp-2">
          {block.description}
        </p>
      )}

      {/* Footer */}
      <div className="flex items-center gap-2 mt-4 pt-3 border-t">
        <Code weight="bold" className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs text-muted-foreground truncate">
          {block.path}
        </span>
      </div>
    </Link>
  );
}
