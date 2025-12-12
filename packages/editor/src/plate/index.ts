/**
 * Plate Editor Module
 *
 * Exports the visual editor and related utilities for use in applications.
 */

// Main editor component
export { PlateVisualEditor } from './PlateVisualEditor'

// Editor kit (plugins configuration)
export { EditorKit } from './editor-kit'

// Converters
export { sourceToPlateValueSurgical, applyPlateChangesToSource, syncIdsFromSource } from './surgical-converters'
export { sourceToPlateValue, plateValueToSource } from './converters'

// Element components
export {
  ParagraphElement,
  H1Element,
  H2Element,
  H3Element,
  BlockquoteElement,
  HrElement,
} from './plate-elements'

// Plugins
export { ElementPlugin, elementFallbackRenderer } from './plugins/element-plugin'
export { SourceSyncPlugin, initSourceSync, updateSourceExternal } from './plugins/source-sync-plugin'
export { DndKit } from './plugins/dnd-kit'
export { BlockSelectionKit } from './plugins/block-selection-kit'
export { SlashKit } from './plugins/slash-kit'

// UI Components
export { BlockDraggable } from './ui/block-draggable'
export { BlockSelection } from './ui/block-selection'
export { SlashInputElement } from './ui/slash-menu'
export { Button } from './ui/button'

// Utilities from element-plugin
export {
  isCustomComponent,
  isStdlibComponent,
  shouldBeVoid,
  HTML_VOID_TAGS,
  HTML_ELEMENTS,
  STDLIB_COMPONENTS,
} from './plugins/element-plugin'
