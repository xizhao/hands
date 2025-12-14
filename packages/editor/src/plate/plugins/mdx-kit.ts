/**
 * MDX Editor Kit
 *
 * Plugin bundle for MDX editing in Plate.
 * Extends the base EditorKit with RSC Block plugin.
 *
 * IMPORTANT: Uses DndKitWithoutProvider because sandbox provides a shared
 * DndProvider at root level. This allows both Plate (for block dragging)
 * and OverlayEditor (for element dragging inside RSC blocks) to share the
 * same react-dnd context without "Cannot have two HTML5 backends" errors.
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
} from "../plate-elements";
import { BlockSelectionKit } from "./block-selection-kit";
import { DndKitWithoutProvider } from "./dnd-kit";
import { ElementPlugin } from "./element-plugin";
import { FloatingToolbarKit } from "./floating-toolbar-kit";
import { RscBlockPlugin } from "./rsc-block-plugin";
import { SlashKit } from "./slash-kit";

export const MdxEditorKit = [
  // RSC Block Plugin - Must be before ElementPlugin to take precedence
  RscBlockPlugin,

  // Unified Element Plugin
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

  // DnD - uses DndKitWithoutProvider since sandbox provides shared DndProvider
  ...DndKitWithoutProvider,

  // Block Selection - Multi-block select
  ...BlockSelectionKit,

  // Slash Menu - Command palette
  ...SlashKit,

  // Floating Toolbar - Selection formatting
  ...FloatingToolbarKit,

  // Utilities
  TrailingBlockPlugin,
];
