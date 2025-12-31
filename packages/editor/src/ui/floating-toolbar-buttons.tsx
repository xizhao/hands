'use client';

/**
 * Floating toolbar buttons for the editor.
 *
 * This is the primary text formatting toolbar that appears on text selection.
 * Contains all text-level formatting: bold, italic, underline, strikethrough,
 * code, colors, and links.
 */

import {
  Code,
  TextB,
  TextItalic,
  TextStrikethrough,
  TextUnderline,
} from "@phosphor-icons/react";
import { KEYS } from 'platejs';
import { useEditorReadOnly } from 'platejs/react';

import { FontColorToolbarButton } from './font-color-toolbar-button';
import { LinkToolbarButton } from './link-toolbar-button';
import { MarkToolbarButton } from './mark-toolbar-button';
import { ToolbarSeparator } from './toolbar';
import { TurnIntoToolbarButton } from './turn-into-toolbar-button';

export function FloatingToolbarButtons() {
  const readOnly = useEditorReadOnly();

  if (readOnly) {
    return null;
  }

  return (
    <div className="flex items-center gap-0.5">
      {/* Block type switcher */}
      <TurnIntoToolbarButton />

      <ToolbarSeparator />

      {/* Text formatting marks */}
      <MarkToolbarButton nodeType={KEYS.bold} tooltip="Bold (⌘B)">
        <TextB size={16} weight="bold" />
      </MarkToolbarButton>
      <MarkToolbarButton nodeType={KEYS.italic} tooltip="Italic (⌘I)">
        <TextItalic size={16} />
      </MarkToolbarButton>
      <MarkToolbarButton nodeType={KEYS.underline} tooltip="Underline (⌘U)">
        <TextUnderline size={16} />
      </MarkToolbarButton>
      <MarkToolbarButton nodeType={KEYS.strikethrough} tooltip="Strikethrough">
        <TextStrikethrough size={16} />
      </MarkToolbarButton>
      <MarkToolbarButton nodeType={KEYS.code} tooltip="Code (⌘E)">
        <Code size={16} />
      </MarkToolbarButton>

      <ToolbarSeparator />

      {/* Color picker */}
      <FontColorToolbarButton />

      <ToolbarSeparator />

      {/* Link */}
      <LinkToolbarButton />
    </div>
  );
}
