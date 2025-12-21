'use client';

/**
 * Default floating toolbar buttons for the editor.
 *
 * This provides a basic set of formatting buttons. Desktop or other consumers
 * can override this by providing their own FloatingToolbarButtons to FloatingToolbar.
 */

import { useEditorReadOnly } from 'platejs/react';

import { MarkToolbarButton } from './mark-toolbar-button';
import { ToolbarSeparator } from './toolbar';
import { TurnIntoToolbarButton } from './turn-into-toolbar-button';
import { LinkToolbarButton } from './link-toolbar-button';

export function FloatingToolbarButtons() {
  const readOnly = useEditorReadOnly();

  if (readOnly) {
    return null;
  }

  return (
    <div className="flex items-center gap-0.5">
      <TurnIntoToolbarButton />
      <ToolbarSeparator />
      <MarkToolbarButton nodeType="bold" tooltip="Bold (⌘B)" />
      <MarkToolbarButton nodeType="italic" tooltip="Italic (⌘I)" />
      <MarkToolbarButton nodeType="underline" tooltip="Underline (⌘U)" />
      <MarkToolbarButton nodeType="strikethrough" tooltip="Strikethrough" />
      <MarkToolbarButton nodeType="code" tooltip="Code (⌘E)" />
      <ToolbarSeparator />
      <LinkToolbarButton />
    </div>
  );
}
