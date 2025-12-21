/**
 * Slash Menu - Command menu for inserting blocks and stdlib components
 *
 * Shows:
 * - Stdlib components (LiveValue, LiveAction, etc.) from @hands/core
 * - Available blocks from the workbook manifest
 * - "Make with Hands" to create a new block via AI
 */

import { Cube, Lightning, Sparkle } from "@phosphor-icons/react";
import type { PlateEditor, PlateElementProps } from "platejs/react";
import { PlateElement } from "platejs/react";
import { useMemo } from "react";
import { useManifest } from "@/hooks/useRuntimeState";
import { SANDBOXED_BLOCK_KEY, type TSandboxedBlockElement } from "../SandboxedBlock";
import {
  createLiveValueElement,
  createLiveActionElement,
  createButtonElement,
  createInputElement,
  createSelectElement,
  createCheckboxElement,
  createTextareaElement,
  createMetricElement,
  createBadgeElement,
  createProgressElement,
  createAlertElement,
} from "../plugins/live-query-kit";
import { STDLIB_COMPONENTS } from "@hands/core/docs";
import {
  InlineCombobox,
  InlineComboboxContent,
  InlineComboboxEmpty,
  InlineComboboxGroup,
  InlineComboboxInput,
  InlineComboboxItem,
  useInlineComboboxSearchValue,
} from "./inline-combobox";

function insertBlock(editor: PlateEditor, blockSrc: string) {
  const node: TSandboxedBlockElement = {
    type: SANDBOXED_BLOCK_KEY,
    src: blockSrc,
    children: [{ text: "" }],
  };
  editor.tf.insertNodes(node);
}

/**
 * Insert an editing block that will be created by AI
 */
function insertEditingBlock(editor: PlateEditor, prompt: string) {
  const node: TSandboxedBlockElement = {
    type: SANDBOXED_BLOCK_KEY,
    editing: true,
    prompt,
    children: [{ text: "" }],
  };
  editor.tf.insertNodes(node);
}

/**
 * Insert a stdlib component
 */
function insertStdlibComponent(editor: PlateEditor, componentName: string) {
  switch (componentName) {
    case "LiveValue":
      editor.tf.insertNodes(createLiveValueElement("SELECT 1"));
      break;
    case "LiveAction":
      editor.tf.insertNodes(
        createLiveActionElement(
          { sql: "UPDATE table SET column = {{value}} WHERE id = 1" },
          [
            { type: "p", children: [createButtonElement("Submit")] },
          ]
        )
      );
      break;
    case "ActionButton":
      editor.tf.insertNodes(createButtonElement("Click me"));
      break;
    case "ActionInput":
      editor.tf.insertNodes(createInputElement("value", { placeholder: "Enter value..." }));
      break;
    case "ActionSelect":
      editor.tf.insertNodes(
        createSelectElement("choice", [
          { value: "option1", label: "Option 1" },
          { value: "option2", label: "Option 2" },
        ])
      );
      break;
    case "ActionCheckbox":
      editor.tf.insertNodes(createCheckboxElement("enabled"));
      break;
    case "ActionTextarea":
      editor.tf.insertNodes(createTextareaElement("content", { placeholder: "Enter text..." }));
      break;
    case "Metric":
      editor.tf.insertNodes(createMetricElement(1234, { label: "Total", suffix: "" }));
      break;
    case "Badge":
      editor.tf.insertNodes(createBadgeElement("Status", "default"));
      break;
    case "Progress":
      editor.tf.insertNodes(createProgressElement(50, { label: "Progress", showValue: true }));
      break;
    case "Alert":
      editor.tf.insertNodes(createAlertElement("This is an informational message.", { variant: "default" }));
      break;
  }
}

/**
 * "Make with Hands" option - creates a new block via AI
 */
function MakeWithHandsItem({ editor }: { editor: PlateEditor }) {
  const searchValue = useInlineComboboxSearchValue();

  // Only show when there's a search value (the prompt)
  if (!searchValue || searchValue.trim() === "") {
    return null;
  }

  return (
    <InlineComboboxItem
      alwaysShow
      keywords={["make", "create", "build", "hands", "ai", "generate"]}
      label="Make with Hands"
      onClick={() => insertEditingBlock(editor, searchValue.trim())}
      value="make-with-hands"
    >
      <div className="flex size-8 shrink-0 items-center justify-center rounded border border-brand/30 bg-brand/10">
        <Sparkle weight="fill" className="size-4 text-brand" />
      </div>
      <div className="ml-2 flex flex-1 flex-col truncate">
        <span className="text-foreground text-sm">Make with Hands</span>
        <span className="truncate text-muted-foreground text-xs">
          Create "{searchValue.trim()}" with AI
        </span>
      </div>
    </InlineComboboxItem>
  );
}

/**
 * Stdlib components section
 */
function StdlibSection({ editor }: { editor: PlateEditor }) {
  const searchValue = useInlineComboboxSearchValue();

  // Convert STDLIB_COMPONENTS to array for filtering
  const components = useMemo(() => {
    return Object.entries(STDLIB_COMPONENTS).map(([name, meta]) => ({
      name,
      ...meta,
    }));
  }, []);

  const filteredComponents = useMemo(() => {
    if (!searchValue) return components;
    const search = searchValue.toLowerCase();
    return components.filter(
      (comp) =>
        comp.name.toLowerCase().includes(search) ||
        comp.description.toLowerCase().includes(search) ||
        comp.keywords.some((k: string) => k.toLowerCase().includes(search))
    );
  }, [components, searchValue]);

  if (filteredComponents.length === 0) return null;

  return (
    <>
      <div className="mt-1.5 mb-2 px-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">
        Components
      </div>
      {filteredComponents.map((comp) => (
        <InlineComboboxItem
          key={comp.name}
          keywords={[comp.name, ...comp.keywords]}
          label={comp.name}
          onClick={() => insertStdlibComponent(editor, comp.name)}
          value={`stdlib:${comp.name}`}
        >
          <div className="flex size-8 shrink-0 items-center justify-center rounded border border-violet-500/30 bg-violet-500/10">
            <Lightning weight="fill" className="size-4 text-violet-500" />
          </div>
          <div className="ml-2 flex flex-1 flex-col truncate">
            <span className="text-foreground text-sm">{comp.name}</span>
            <span className="truncate text-muted-foreground text-xs">
              {comp.description}
            </span>
          </div>
        </InlineComboboxItem>
      ))}
    </>
  );
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

  return (
    <>
      {/* Always show "Make with Hands" first when there's a search value */}
      <MakeWithHandsItem editor={editor} />

      {/* Show existing blocks */}
      {filteredBlocks.length > 0 && (
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
      )}
    </>
  );
}

export function SlashInputElement(props: PlateElementProps) {
  const { children, editor, element } = props;

  return (
    <PlateElement {...props} as="span">
      <InlineCombobox element={element} trigger="/">
        <InlineComboboxInput placeholder="Search blocks or describe what to create..." />

        <InlineComboboxContent variant="slash">
          <InlineComboboxEmpty>
            <span className="text-muted-foreground">
              Type to search blocks or describe what to create
            </span>
          </InlineComboboxEmpty>
          <InlineComboboxGroup>
            <StdlibSection editor={editor} />
            <BlocksSection editor={editor} />
          </InlineComboboxGroup>
        </InlineComboboxContent>
      </InlineCombobox>

      {children}
    </PlateElement>
  );
}
