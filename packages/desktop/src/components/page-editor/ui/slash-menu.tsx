/**
 * Slash Menu - Command menu for inserting blocks
 *
 * Shows available blocks from the workbook manifest.
 */

import { Cube } from "@phosphor-icons/react";
import type { TElement } from "platejs";
import type { PlateEditor, PlateElementProps } from "platejs/react";
import { PlateElement } from "platejs/react";
import { useMemo } from "react";
import { useManifest } from "@/hooks/useRuntimeState";
import {
  InlineCombobox,
  InlineComboboxContent,
  InlineComboboxGroup,
  InlineComboboxInput,
  InlineComboboxItem,
  useInlineComboboxSearchValue,
} from "./inline-combobox";

function insertBlock(editor: PlateEditor, blockId: string) {
  const node: TElement = {
    type: "rsc-block",
    blockId,
    source: "",
    blockProps: {},
    id: crypto.randomUUID(),
    children: [{ text: "" }],
  };
  editor.tf.insertNodes(node);
}

/**
 * Block items section
 */
function BlocksSection({ editor }: { editor: PlateEditor }) {
  const { data: manifest } = useManifest();
  const searchValue = useInlineComboboxSearchValue();
  const blocks = manifest?.blocks ?? [];

  const filteredBlocks = useMemo(() => {
    if (!searchValue) return blocks;
    const search = searchValue.toLowerCase();
    return blocks.filter(
      (block) =>
        block.title.toLowerCase().includes(search) ||
        block.id.toLowerCase().includes(search)
    );
  }, [blocks, searchValue]);

  if (filteredBlocks.length === 0) {
    return (
      <div className="px-3 py-4 text-center text-muted-foreground text-sm">
        {blocks.length === 0 ? "No blocks in workbook" : "No matching blocks"}
      </div>
    );
  }

  return (
    <>
      <div className="mt-1.5 mb-2 px-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">
        Blocks
      </div>
      {filteredBlocks.map((block) => (
        <InlineComboboxItem
          key={block.id}
          keywords={[block.id, block.title]}
          label={block.title}
          onClick={() => insertBlock(editor, block.id)}
          value={`block:${block.id}`}
        >
          <div className="flex size-8 shrink-0 items-center justify-center rounded border border-border bg-background">
            <Cube className="size-4 text-muted-foreground" />
          </div>
          <div className="ml-2 flex flex-1 flex-col truncate">
            <span className="text-foreground text-sm">{block.title}</span>
            {block.description && (
              <span className="truncate text-muted-foreground text-xs">
                {block.description}
              </span>
            )}
          </div>
        </InlineComboboxItem>
      ))}
    </>
  );
}

export function SlashInputElement(props: PlateElementProps) {
  const { children, editor, element } = props;

  return (
    <PlateElement {...props} as="span">
      <InlineCombobox element={element} trigger="/">
        <InlineComboboxInput />

        <InlineComboboxContent variant="slash">
          <InlineComboboxGroup>
            <BlocksSection editor={editor} />
          </InlineComboboxGroup>
        </InlineComboboxContent>
      </InlineCombobox>

      {children}
    </PlateElement>
  );
}
