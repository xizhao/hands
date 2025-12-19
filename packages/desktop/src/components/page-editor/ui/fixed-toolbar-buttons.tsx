"use client";

import {
  Code,
  List,
  ListNumbers,
  Quotes,
  Square,
  TextB,
  TextItalic,
  TextStrikethrough,
  TextUnderline,
} from "@phosphor-icons/react";
import { KEYS } from "platejs";
import { useEditorReadOnly, useEditorRef, useSelectionFragmentProp } from "platejs/react";
import { useCallback } from "react";

import { cn } from "@/lib/utils";
import { getBlockType, setBlockType } from "../transforms";

import { InlineEquationToolbarButton } from "./equation-toolbar-button";
import { FontColorToolbarButton } from "./font-color-toolbar-button";
import { LinkToolbarButton } from "./link-toolbar-button";
import { MarkToolbarButton } from "./mark-toolbar-button";
import { ToolbarGroup } from "./toolbar";
import { TurnIntoToolbarButton } from "./turn-into-toolbar-button";

// ============================================================================
// Block Type Button (for lists, quotes, etc.)
// ============================================================================

interface BlockTypeButtonProps {
  type: string;
  icon: React.ReactNode;
  tooltip: string;
}

function BlockTypeButton({ type, icon, tooltip }: BlockTypeButtonProps) {
  const editor = useEditorRef();

  const currentType = useSelectionFragmentProp({
    defaultValue: KEYS.p,
    getProp: (node) => getBlockType(node as any),
  });

  const isActive = currentType === type;

  const handleClick = useCallback(() => {
    setBlockType(editor, isActive ? KEYS.p : type);
    editor.tf.focus();
  }, [editor, type, isActive]);

  return (
    <button
      type="button"
      onClick={handleClick}
      title={tooltip}
      data-state={isActive ? "on" : "off"}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded text-foreground/80 transition-all duration-100",
        "hover:bg-accent hover:text-accent-foreground",
        isActive && "bg-accent text-accent-foreground",
      )}
    >
      {icon}
    </button>
  );
}

// ============================================================================
// Fixed Toolbar Buttons
// ============================================================================

export function FixedToolbarButtons() {
  const readOnly = useEditorReadOnly();

  if (readOnly) {
    return null;
  }

  return (
    <div className="flex items-center">
      {/* Block Type Switcher */}
      <ToolbarGroup>
        <TurnIntoToolbarButton />
      </ToolbarGroup>

      {/* Text Formatting */}
      <ToolbarGroup>
        <MarkToolbarButton nodeType={KEYS.bold} shortcut="⌘+B" tooltip="Bold">
          <TextB size={16} weight="bold" />
        </MarkToolbarButton>

        <MarkToolbarButton nodeType={KEYS.italic} shortcut="⌘+I" tooltip="Italic">
          <TextItalic size={16} />
        </MarkToolbarButton>

        <MarkToolbarButton nodeType={KEYS.underline} shortcut="⌘+U" tooltip="Underline">
          <TextUnderline size={16} />
        </MarkToolbarButton>

        <MarkToolbarButton
          nodeType={KEYS.strikethrough}
          shortcut="⌘+Shift+X"
          tooltip="Strikethrough"
        >
          <TextStrikethrough size={16} />
        </MarkToolbarButton>

        <MarkToolbarButton nodeType={KEYS.code} shortcut="⌘+E" tooltip="Inline Code">
          <Code size={16} />
        </MarkToolbarButton>
      </ToolbarGroup>

      {/* Color, Equation & Link */}
      <ToolbarGroup>
        <FontColorToolbarButton />
        <InlineEquationToolbarButton />
        <LinkToolbarButton />
      </ToolbarGroup>

      {/* Lists */}
      <ToolbarGroup>
        <BlockTypeButton
          type={KEYS.ul}
          icon={<List size={16} />}
          tooltip="Bulleted List"
        />
        <BlockTypeButton
          type={KEYS.ol}
          icon={<ListNumbers size={16} />}
          tooltip="Numbered List"
        />
        <BlockTypeButton
          type={KEYS.listTodo}
          icon={<Square size={16} />}
          tooltip="To-do List"
        />
      </ToolbarGroup>

      {/* Block Formatting */}
      <ToolbarGroup>
        <BlockTypeButton
          type={KEYS.blockquote}
          icon={<Quotes size={16} />}
          tooltip="Quote"
        />
        <BlockTypeButton
          type={KEYS.codeBlock}
          icon={<Code size={16} weight="bold" />}
          tooltip="Code Block"
        />
      </ToolbarGroup>
    </div>
  );
}
