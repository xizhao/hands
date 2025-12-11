/**
 * Plate Editor Kit for the demo
 *
 * Real Plate plugins with actual element components.
 * Includes DnD, Block Selection, and Slash Menu.
 */

import {
  BoldPlugin,
  ItalicPlugin,
  UnderlinePlugin,
  StrikethroughPlugin,
  CodePlugin,
  BlockquotePlugin,
  H1Plugin,
  H2Plugin,
  H3Plugin,
  HorizontalRulePlugin,
} from '@platejs/basic-nodes/react'
import { ParagraphPlugin } from 'platejs/react'
import { TrailingBlockPlugin } from 'platejs'

import { StdlibComponentKit } from './stdlib-component-plugin'
import {
  ParagraphElement,
  H1Element,
  H2Element,
  H3Element,
  BlockquoteElement,
  HrElement,
} from './plate-elements'

// Plugin kits
import { DndKit } from './plugins/dnd-kit'
import { BlockSelectionKit } from './plugins/block-selection-kit'
import { SlashKit } from './plugins/slash-kit'

export const EditorKit = [
  // Block Elements with real components
  ParagraphPlugin.withComponent(ParagraphElement),
  H1Plugin.configure({
    node: { component: H1Element },
    rules: { break: { empty: 'reset' } },
  }),
  H2Plugin.configure({
    node: { component: H2Element },
    rules: { break: { empty: 'reset' } },
  }),
  H3Plugin.configure({
    node: { component: H3Element },
    rules: { break: { empty: 'reset' } },
  }),
  BlockquotePlugin.configure({
    node: { component: BlockquoteElement },
  }),
  HorizontalRulePlugin.withComponent(HrElement),

  // Stdlib Components
  ...StdlibComponentKit,

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
]
