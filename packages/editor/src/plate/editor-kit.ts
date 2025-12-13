/**
 * Plate Editor Kit for the demo
 *
 * Real Plate plugins with actual element components.
 * Includes DnD, Block Selection, and Slash Menu.
 *
 * Key design: Every JSX element is a Plate block, editable with its original tag name.
 */

import {
  BlockquotePlugin,
  BoldPlugin,
  CodePlugin,
  H1Plugin,
  H2Plugin,
  H3Plugin,
  HorizontalRulePlugin,
  ItalicPlugin,
  StrikethroughPlugin,
  UnderlinePlugin,
} from "@platejs/basic-nodes/react";
import { TrailingBlockPlugin } from "platejs";
import { ParagraphPlugin } from "platejs/react";

import {
  BlockquoteElement,
  H1Element,
  H2Element,
  H3Element,
  HrElement,
  ParagraphElement,
} from "./plate-elements";
import { BlockSelectionKit } from "./plugins/block-selection-kit";
// Plugin kits
import { DndKit } from "./plugins/dnd-kit";
import { ElementPlugin } from "./plugins/element-plugin";
import { SlashKit } from "./plugins/slash-kit";

export const EditorKit = [
  // Unified Element Plugin - Renders ALL elements (HTML + custom components)
  // Single source of truth for isVoid logic
  ElementPlugin,

  // Block Elements with real components
  ParagraphPlugin.withComponent(ParagraphElement),
  H1Plugin.configure({
    node: { component: H1Element },
    rules: { break: { empty: "reset" } },
  }),
  H2Plugin.configure({
    node: { component: H2Element },
    rules: { break: { empty: "reset" } },
  }),
  H3Plugin.configure({
    node: { component: H3Element },
    rules: { break: { empty: "reset" } },
  }),
  BlockquotePlugin.configure({
    node: { component: BlockquoteElement },
  }),
  HorizontalRulePlugin.withComponent(HrElement),

  // Marks
  BoldPlugin,
  ItalicPlugin,
  UnderlinePlugin,
  StrikethroughPlugin,
  CodePlugin,

  // DnD - Drag and Drop
  ...DndKit,

  // Block Selection - Multi-block select
  ...BlockSelectionKit,

  // Slash Menu - Command palette
  ...SlashKit,

  // Utilities
  TrailingBlockPlugin,
];
