"use client";

import {
  Code,
  TextB,
  TextHOne,
  TextHThree,
  TextHTwo,
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
import { ToolbarGroup, ToolbarSeparator } from "./toolbar";
import { TurnIntoToolbarButton } from "./turn-into-toolbar-button";

// ============================================================================
// Header Button
// ============================================================================

interface HeaderButtonProps {
  level: 1 | 2 | 3;
}

function HeaderButton({ level }: HeaderButtonProps) {
  const editor = useEditorRef();

  const currentType = useSelectionFragmentProp({
    defaultValue: KEYS.p,
    getProp: (node) => getBlockType(node as any),
  });

  const isActive = currentType === `h${level}`;

  const handleClick = useCallback(() => {
    setBlockType(editor, isActive ? KEYS.p : `h${level}`);
    editor.tf.focus();
  }, [editor, level, isActive]);

  const icons = {
    1: <TextHOne size={14} weight={isActive ? "bold" : "regular"} />,
    2: <TextHTwo size={14} weight={isActive ? "bold" : "regular"} />,
    3: <TextHThree size={14} weight={isActive ? "bold" : "regular"} />,
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      title={`Heading ${level}`}
      data-state={isActive ? "on" : "off"}
      className={cn(
        "flex h-6 w-6 items-center justify-center rounded text-foreground/80 transition-all duration-100",
        "hover:bg-accent hover:text-accent-foreground",
        isActive && "bg-accent text-accent-foreground",
      )}
    >
      {icons[level]}
    </button>
  );
}

// ============================================================================
// Separator
// ============================================================================

function Separator() {
  return <div className="mx-0.5 h-4 w-px bg-border" />;
}

// ============================================================================
// Floating Toolbar Buttons
// ============================================================================

export function FloatingToolbarButtons() {
  const editor = useEditorRef();
  const readOnly = useEditorReadOnly();

  return (
    <div
      className="flex items-center gap-0.5"
      style={{
        whiteSpace: "nowrap",
      }}
    >
      {!readOnly && (
        <>
          {/* Header buttons */}
          <HeaderButton level={1} />
          <HeaderButton level={2} />
          <HeaderButton level={3} />

          <Separator />

          {/* Turn into dropdown */}
          <TurnIntoToolbarButton />

          <Separator />

          {/* Mark buttons with Phosphor icons */}
          <MarkToolbarButton nodeType={KEYS.bold} shortcut="⌘+B" tooltip="Bold">
            <TextB size={14} weight="bold" />
          </MarkToolbarButton>

          <MarkToolbarButton nodeType={KEYS.italic} shortcut="⌘+I" tooltip="Italic">
            <TextItalic size={14} />
          </MarkToolbarButton>

          <MarkToolbarButton nodeType={KEYS.underline} shortcut="⌘+U" tooltip="Underline">
            <TextUnderline size={14} />
          </MarkToolbarButton>

          <MarkToolbarButton
            nodeType={KEYS.strikethrough}
            shortcut="⌘+Shift+X"
            tooltip="Strikethrough"
          >
            <TextStrikethrough size={14} />
          </MarkToolbarButton>

          <MarkToolbarButton nodeType={KEYS.code} shortcut="⌘+E" tooltip="Code">
            <Code size={14} />
          </MarkToolbarButton>

          <Separator />

          <InlineEquationToolbarButton />
          <LinkToolbarButton />
          <FontColorToolbarButton />
        </>
      )}
    </div>
  );
}
