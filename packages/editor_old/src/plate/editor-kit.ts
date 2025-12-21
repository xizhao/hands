"use client";

/**
 * Plate Editor Kit
 *
 * Full-featured editor based on Potion template with custom ElementPlugin for MDX rendering.
 * Note: AI, Comment, and Suggestion features are disabled - they require additional setup.
 *
 * IMPORTANT: Uses DndKitWithoutProvider because sandbox provides a shared
 * DndProvider at root level. This prevents "Cannot have two HTML5 backends"
 * errors when the editor is rendered inside the sandbox iframe.
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
import { DndKitWithoutProvider } from "./plugins/dnd-kit";
import { ExitBreakKit } from "./plugins/exit-break-kit";
import { FloatingToolbarKit } from "./plugins/floating-toolbar-kit";
import { FontKit } from "./plugins/font-kit";
import { ListKit } from "./plugins/list-kit";
import { SlashKit } from "./plugins/slash-kit";
import { TableKit } from "./plugins/table-kit";
import { ToggleKit } from "./plugins/toggle-kit";
import { EmojiKit } from "./plugins/emoji-kit";

// Our custom MDX element plugin
import { ElementPlugin } from "./plugins/element-plugin";

export const EditorKit = [
  // Custom MDX Element Plugin - Renders ALL elements (HTML + custom components)
  // Must come first as single source of truth for isVoid logic
  ElementPlugin,

  // Elements
  ...BasicBlocksKit,
  ...CodeBlockKit,
  ...TableKit,
  ...ToggleKit,
  ...CalloutKit,

  // Marks
  ...BasicMarksKit,
  ...FontKit,

  // Block Style
  ...ListKit,

  // Editing
  ...SlashKit,
  ...EmojiKit,
  ...AutoformatKit,
  ...DndKitWithoutProvider,
  ...ExitBreakKit,
  TrailingBlockPlugin,

  // UI
  ...BlockSelectionKit,
  ...FloatingToolbarKit,
];

export type MyEditor = TPlateEditor<Value, (typeof EditorKit)[number]>;

export const useEditor = () => useEditorRef<MyEditor>();
