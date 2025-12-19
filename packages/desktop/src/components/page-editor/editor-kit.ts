"use client";

/**
 * Plate Editor Kit
 *
 * Full-featured editor based on Potion template.
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
import { CopilotKit } from "./plugins/copilot-kit";
import { DndKit } from "./plugins/dnd-kit";
import { EmojiKit } from "./plugins/emoji-kit";
import { ExitBreakKit } from "./plugins/exit-break-kit";
import { FloatingToolbarKit } from "./plugins/floating-toolbar-kit";
import { FontKit } from "./plugins/font-kit";
import { ListKit } from "./plugins/list-kit";
import { PageContextPlugin } from "./plugins/page-context-kit";
import { SlashKit } from "./plugins/slash-kit";
import { AtKit } from "./plugins/at-kit";
import { SandboxedBlockPlugin } from "./SandboxedBlock";
import { TableKit } from "./plugins/table-kit";
import { ToggleKit } from "./plugins/toggle-kit";
import { LiveQueryKit } from "./plugins/live-query-kit";

export const EditorKit = [
  // Page Context (for other plugins to access metadata)
  PageContextPlugin,

  // Elements
  ...BasicBlocksKit,
  ...CodeBlockKit,
  ...TableKit,
  ...ToggleKit,
  ...CalloutKit,
  SandboxedBlockPlugin,
  ...LiveQueryKit,

  // Marks
  ...BasicMarksKit,
  ...FontKit,

  // Block Style
  ...ListKit,

  // Editing
  ...AtKit,
  ...SlashKit,
  ...EmojiKit,
  ...AutoformatKit,
  ...DndKit,
  ...ExitBreakKit,
  TrailingBlockPlugin,

  // UI
  ...BlockSelectionKit,
  ...FloatingToolbarKit,

  // AI
  ...CopilotKit,
];

export type MyEditor = TPlateEditor<Value, (typeof EditorKit)[number]>;

export const useEditor = () => useEditorRef<MyEditor>();
