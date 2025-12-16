/**
 * Slash Menu - Command menu for inserting blocks
 *
 * Structure:
 * 1. Actions - AI generation, always visible
 * 2. My Blocks - Blocks from current workbook
 */

import { BoxIcon } from "lucide-react";
import type { TElement } from "platejs";
import type { PlateEditor, PlateElementProps } from "platejs/react";
import { PlateElement } from "platejs/react";
import type * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { getTRPCClient } from "../../trpc";
import {
  InlineCombobox,
  InlineComboboxContent,
  InlineComboboxGroup,
  InlineComboboxInput,
  InlineComboboxItem,
  useInlineComboboxSearchValue,
} from "./inline-combobox";

// Hands logo component
function HandsLogo({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      fill="currentColor"
    >
      <path d="M8 12h4v8H8zM14 10h4v10h-4zM20 14h4v6h-4z" />
    </svg>
  );
}

type SlashMenuItem = {
  icon: React.ReactNode;
  value: string;
  onSelect: (editor: PlateEditor, searchValue: string) => void;
  description?: string;
  keywords?: string[];
  label?: string;
  alwaysShow?: boolean; // Always show regardless of filter
};

function insertBlock(editor: PlateEditor, blockId: string, options: { editing?: boolean; prompt?: string } = {}) {
  // Insert an RSC block element that renders via <Block src="blockId" />
  const node: TElement = {
    type: "rsc-block",
    blockId,
    source: "", // Source is fetched from runtime by blockId
    blockProps: {},
    id: crypto.randomUUID(),
    editing: options.editing,
    prompt: options.prompt,
    children: [{ text: "" }],
  };
  editor.tf.insertNodes(node);

  // Trigger onBlockCreate callback if editing (new block being created)
  if (options.editing && options.prompt) {
    const onBlockCreate = (editor as any).onBlockCreate as ((prompt: string, blockElementId: string) => void) | undefined;
    if (onBlockCreate) {
      onBlockCreate(options.prompt, node.id as string);
    }
  }
}

interface BlockWithThumbnail {
  id: string;
  title: string;
  thumbnail?: string; // base64 data URL
}

/**
 * Hook to fetch workbook blocks with thumbnails via tRPC
 */
function useWorkbookBlocks(runtimePort: number | undefined) {
  const [blocks, setBlocks] = useState<BlockWithThumbnail[]>([]);

  useEffect(() => {
    if (!runtimePort) return;

    const trpc = getTRPCClient(runtimePort);

    // Fetch manifest first
    trpc.workbook.manifest
      .query()
      .then(async (manifest) => {
        const blocksWithThumbnails: BlockWithThumbnail[] = [];

        // Detect current theme
        const isDark = document.documentElement.classList.contains("dark");
        const theme = isDark ? "dark" : "light";

        // Fetch thumbnails for each block
        for (const block of manifest.blocks) {
          let thumbnail: string | undefined;

          try {
            const thumbs = await trpc.thumbnails.get.query({
              type: "block",
              contentId: block.id,
            });
            // Use LQIP (tiny blurred version) for menu items - faster to render
            const thumb = thumbs[theme] || thumbs.light || thumbs.dark;
            if (thumb?.lqip) {
              thumbnail = thumb.lqip;
            }
          } catch {
            // Thumbnail not available, use icon fallback
          }

          blocksWithThumbnails.push({
            id: block.id,
            title: block.title,
            thumbnail,
          });
        }

        setBlocks(blocksWithThumbnails);
      })
      .catch((err) => {
        console.error("[SlashMenu] Failed to fetch blocks:", err);
      });
  }, [runtimePort]);

  return blocks;
}

/**
 * Slash menu item component
 */
function SlashMenuItemContent({
  icon,
  label,
  value,
  description,
  variant = "default",
  hasThumbnail = false,
}: {
  icon: React.ReactNode;
  label?: string;
  value: string;
  description?: string;
  variant?: "default" | "action";
  hasThumbnail?: boolean;
}) {
  if (variant === "action") {
    return (
      <>
        <div className="flex size-8 shrink-0 items-center justify-center rounded bg-primary/10 [&_svg]:size-4 [&_svg]:text-primary">
          {icon}
        </div>
        <div className="ml-2 flex flex-1 flex-col truncate">
          <span className="text-foreground text-sm font-medium">{label ?? value}</span>
          {description && (
            <span className="truncate text-muted-foreground text-xs">{description}</span>
          )}
        </div>
      </>
    );
  }

  // Thumbnail items: show image directly without border/background
  if (hasThumbnail) {
    return (
      <>
        <div className="size-8 shrink-0 overflow-hidden rounded">
          {icon}
        </div>
        <div className="ml-2 flex flex-1 flex-col truncate">
          <span className="text-foreground text-sm">{label ?? value}</span>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="flex size-8 shrink-0 items-center justify-center rounded border border-border bg-background [&_svg]:size-4 [&_svg]:text-muted-foreground">
        {icon}
      </div>
      <div className="ml-2 flex flex-1 flex-col truncate">
        <span className="text-foreground text-sm">{label ?? value}</span>
        {description && (
          <span className="truncate text-muted-foreground text-xs">{description}</span>
        )}
      </div>
    </>
  );
}

/**
 * Section component that hides when no items match filter
 */
function SlashMenuSection({
  title,
  items,
  editor,
}: {
  title: string;
  items: SlashMenuItem[];
  editor: PlateEditor;
}) {
  const searchValue = useInlineComboboxSearchValue();

  // Check if any items would be visible after filtering
  const visibleItems = useMemo(() => {
    if (!searchValue) return items;
    const search = searchValue.toLowerCase();
    return items.filter(({ value, keywords = [], label, alwaysShow }) => {
      if (alwaysShow) return true;
      const terms = [value, ...keywords, label, title].filter(Boolean);
      return terms.some((term) => term?.toLowerCase().includes(search));
    });
  }, [items, searchValue, title]);

  if (visibleItems.length === 0) return null;

  return (
    <InlineComboboxGroup>
      <div className="mt-1.5 mb-2 px-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">
        {title}
      </div>
      {visibleItems.map(({ description, icon, keywords, label, value, onSelect, alwaysShow }) => (
        <InlineComboboxItem
          key={value}
          alwaysShow={alwaysShow}
          keywords={keywords}
          label={label}
          onClick={() => onSelect(editor, searchValue || "")}
          value={value}
        >
          <SlashMenuItemContent
            icon={icon}
            label={label}
            value={value}
            description={alwaysShow && searchValue?.trim() ? `"${searchValue.trim()}"` : description}
            variant={alwaysShow ? "action" : "default"}
          />
        </InlineComboboxItem>
      ))}
    </InlineComboboxGroup>
  );
}

/**
 * Block thumbnail component - shows image or fallback icon
 */
function BlockThumbnail({ thumbnail }: { thumbnail?: string }) {
  if (thumbnail) {
    return (
      <img
        src={thumbnail}
        alt=""
        className="size-8 rounded object-cover"
      />
    );
  }
  return <BoxIcon className="size-4" />;
}

/**
 * My Blocks section - shows existing blocks from workbook
 * "Make with Hands" is always visible at top as the primary way to create new blocks
 */
function MyBlocksSection({
  blocks,
  editor,
}: {
  blocks: BlockWithThumbnail[];
  editor: PlateEditor;
}) {
  const searchValue = useInlineComboboxSearchValue();

  // Convert blocks to menu items
  const blockItems = useMemo(
    () =>
      blocks.map((block) => ({
        icon: <BlockThumbnail thumbnail={block.thumbnail} />,
        label: block.title,
        value: `block:${block.id}`,
        keywords: [block.id, block.title],
        onSelect: (ed: PlateEditor, _searchValue: string) => insertBlock(ed, block.id),
        hasThumbnail: !!block.thumbnail,
      })),
    [blocks],
  );

  // Filter items based on search
  const visibleItems = useMemo(() => {
    if (!searchValue) return blockItems;
    const search = searchValue.toLowerCase();
    return blockItems.filter(({ value, keywords = [], label }) => {
      const terms = [value, ...keywords, label].filter(Boolean);
      return terms.some((term) => term?.toLowerCase().includes(search));
    });
  }, [blockItems, searchValue]);

  // Don't show section if no blocks exist or none match search
  if (visibleItems.length === 0) {
    return null;
  }

  return (
    <InlineComboboxGroup>
      <div className="mt-1.5 mb-2 px-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">
        My Blocks
      </div>
      {visibleItems.map(({ icon, keywords, label, value, onSelect, hasThumbnail }) => (
        <InlineComboboxItem
          key={value}
          keywords={keywords}
          label={label}
          onClick={() => onSelect(editor)}
          value={value}
        >
          <SlashMenuItemContent
            icon={icon}
            label={label}
            value={value}
            variant="default"
            hasThumbnail={hasThumbnail}
          />
        </InlineComboboxItem>
      ))}
    </InlineComboboxGroup>
  );
}

/**
 * Make with Hands - standalone item when no blocks exist
 */
function MakeWithHandsItem({ editor }: { editor: PlateEditor }) {
  const searchValue = useInlineComboboxSearchValue();

  return (
    <InlineComboboxGroup>
      <InlineComboboxItem
        alwaysShow
        keywords={["ai", "generate", "create", "make", "hands", "build", "new"]}
        label="Make with Hands"
        onClick={() => {
          // Insert a new block in editing mode with the search text as prompt
          const prompt = searchValue?.trim() || "Create a new block";
          insertBlock(editor, "", { editing: true, prompt });
        }}
        value="hands:make"
      >
        <SlashMenuItemContent
          icon={<HandsLogo className="size-4" />}
          label="Make with Hands"
          value="hands:make"
          description={searchValue?.trim() ? `"${searchValue.trim()}"` : "Create a new block with AI"}
          variant="action"
        />
      </InlineComboboxItem>
    </InlineComboboxGroup>
  );
}

export function SlashInputElement(props: PlateElementProps) {
  const { children, editor, element } = props;

  // Get runtime port from editor
  const runtimePort = (editor as any).runtimePort as number | undefined;

  // Fetch workbook blocks
  const workbookBlocks = useWorkbookBlocks(runtimePort);

  const hasBlocks = workbookBlocks.length > 0;

  // Actions - only show as section when blocks exist
  const actions: SlashMenuItem[] = useMemo(
    () => [
      {
        icon: <HandsLogo className="size-4" />,
        label: "Make with Hands",
        value: "hands:make",
        keywords: ["ai", "generate", "create", "make", "hands", "build", "new"],
        alwaysShow: true,
        description: "Create a new block with AI",
        onSelect: (ed, searchValue) => {
          // Insert a new block in editing mode with the search text as prompt
          const prompt = searchValue?.trim() || "Create a new block";
          insertBlock(ed, "", { editing: true, prompt });
        },
      },
    ],
    [],
  );

  return (
    <PlateElement {...props} as="span">
      <InlineCombobox element={element} trigger="/">
        <InlineComboboxInput />

        <InlineComboboxContent variant="slash">
          {hasBlocks ? (
            <>
              {/* Actions section when blocks exist */}
              <SlashMenuSection title="Actions" items={actions} editor={editor} />
              {/* My Blocks - from workbook */}
              <MyBlocksSection blocks={workbookBlocks} editor={editor} />
            </>
          ) : (
            /* Just "Make with Hands" when no blocks */
            <MakeWithHandsItem editor={editor} />
          )}
        </InlineComboboxContent>
      </InlineCombobox>

      {children}
    </PlateElement>
  );
}
