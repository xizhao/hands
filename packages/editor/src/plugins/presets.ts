/**
 * Editor Plugin Presets
 *
 * These presets provide common plugin configurations for different use cases.
 * All presets include StdlibKit (LiveValue, charts, forms) and MarkdownKit.
 */

import { TrailingBlockPlugin } from "platejs";
import { StdlibKit } from "@hands/core/stdlib";

import { AutoformatKit } from "./autoformat-kit";
import { BasicBlocksKit } from "./basic-blocks-kit";
import { BasicMarksKit } from "./basic-marks-kit";
import { BlockSelectionKit } from "./block-selection-kit";
import { CalloutKit } from "./callout-kit";
import { CardKit } from "./card-kit";
import { CodeBlockKit } from "./code-block-kit";
import { ColumnKit } from "./column-kit";
import { DndKit } from "./dnd-kit";
import { EmojiKit } from "./emoji-kit";
import { ExitBreakKit } from "./exit-break-kit";
import { FloatingToolbarKit } from "./floating-toolbar-kit";
import { FontKit } from "./font-kit";
import { IndentKit } from "./indent-kit";
import { LinkKit } from "./link-kit";
import { ListKit } from "./list-kit";
import { MarkdownKit } from "./markdown-kit";
import { MediaKit } from "./media-kit";
import { MentionKit } from "./mention-kit";
import { TableKit } from "./table-kit";
import { TocKit } from "./toc-kit";
import { ToggleKit } from "./toggle-kit";

/**
 * EditorCorePlugins - All plugins except MarkdownKit
 *
 * Used internally by Editor component to add custom serialization rules.
 * For external use, prefer FullKit which includes MarkdownKit.
 */
export const EditorCorePlugins = [
  ...BasicBlocksKit,
  ...BasicMarksKit,
  ...AutoformatKit,
  TrailingBlockPlugin,
  ...StdlibKit,
  ...TableKit,
  ...ListKit,
  ...IndentKit,
  ...CodeBlockKit,
  ...CalloutKit,
  ...ToggleKit,
  ...ColumnKit,
  ...LinkKit,
  ...FontKit,
  ...MediaKit,
  ...MentionKit,
  ...TocKit,
  ...CardKit,
  ...ExitBreakKit,
  ...EmojiKit,
  ...DndKit,
  ...BlockSelectionKit,
  ...FloatingToolbarKit,
];

/**
 * BaseKit - Minimal editor with basic formatting
 *
 * Includes: paragraphs, headings, bold/italic/etc., autoformat, stdlib, markdown
 */
export const BaseKit = [
  ...BasicBlocksKit,
  ...BasicMarksKit,
  ...AutoformatKit,
  TrailingBlockPlugin,
  ...StdlibKit,
  ...ColumnKit,
  ...MarkdownKit,
];

/**
 * RichTextKit - Full-featured text editing
 *
 * Includes: BaseKit + tables, lists, code blocks, callouts, toggles, links
 */
export const RichTextKit = [
  ...BaseKit,
  ...TableKit,
  ...ListKit,
  ...IndentKit,
  ...CodeBlockKit,
  ...CalloutKit,
  ...ToggleKit,
  ...LinkKit,
  ...FontKit,
  ...MediaKit,
  ...MentionKit,
  ...TocKit,
  ...CardKit,
  ...ExitBreakKit,
];

/**
 * FullKit - Complete editor with all interactive features
 *
 * Includes: RichTextKit + emoji, drag-and-drop, block selection, floating toolbar
 */
export const FullKit = [
  ...RichTextKit,
  ...EmojiKit,
  ...DndKit,
  ...BlockSelectionKit,
  ...FloatingToolbarKit,
];
