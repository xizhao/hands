"use client";

/**
 * Plate Editor Kit
 *
 * Full-featured editor based on Potion template.
 * Note: AI, Comment, and Suggestion features are disabled - they require additional setup.
 */

import { TrailingBlockPlugin, type Value } from "platejs";
import { type TPlateEditor, useEditorRef } from "platejs/react";

// Import plugins directly from plate/plugins (our directory)
import { AutoformatKit } from "./plugins/autoformat-kit";
import { BasicBlocksKit } from "./plugins/basic-blocks-kit";
import { BasicMarksKit } from "./plugins/basic-marks-kit";
import { BlockSelectionKit } from "./plugins/block-selection-kit";
import { CalloutKit } from "./plugins/callout-kit";
import { CodeBlockKit } from "./plugins/code-block-kit";
import { DndKit } from "./plugins/dnd-kit";
import { EmojiKit } from "./plugins/emoji-kit";
import { ExitBreakKit } from "./plugins/exit-break-kit";
import { FloatingToolbarKit } from "./plugins/floating-toolbar-kit";
import { FontKit } from "./plugins/font-kit";
import { ListKit } from "./plugins/list-kit";
import { MarkdownKit } from "./plugins/markdown-kit";
import { SlashKit } from "./plugins/slash-kit";
import { SandboxedBlockPlugin } from "./SandboxedBlock";
import { TableKit } from "./plugins/table-kit";
import { ToggleKit } from "./plugins/toggle-kit";

export const EditorKit = [
  // Elements
  ...BasicBlocksKit,
  ...CodeBlockKit,
  ...TableKit,
  ...ToggleKit,
  ...CalloutKit,
  SandboxedBlockPlugin,

  // Marks
  ...BasicMarksKit,
  ...FontKit,

  // Block Style
  ...ListKit,

  // Editing
  ...SlashKit,
  ...EmojiKit,
  ...AutoformatKit,
  ...DndKit,
  ...ExitBreakKit,
  TrailingBlockPlugin,

  // UI
  ...BlockSelectionKit,
  ...FloatingToolbarKit,

  // Serialization
  ...MarkdownKit,
];

export type MyEditor = TPlateEditor<Value, (typeof EditorKit)[number]>;

export const useEditor = () => useEditorRef<MyEditor>();
