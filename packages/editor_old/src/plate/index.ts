/**
 * Plate Editor Module
 *
 * Exports the visual editor and related utilities for use in applications.
 */

export { plateValueToSource, sourceToPlateValue } from "./converters";

// Static components for SSR/RSC rendering
export * from "./ui/static-components";

// Editor kit (plugins configuration)
export { EditorKit } from "./editor-kit";
// Main editor component
export { PlateVisualEditor } from "./PlateVisualEditor";
// Element components
export {
  BlockquoteElement,
  H1Element,
  H2Element,
  H3Element,
  HrElement,
  ParagraphElement,
} from "./plate-elements";
export { BlockSelectionKit } from "./plugins/block-selection-kit";
export { DndKit } from "./plugins/dnd-kit";
// Plugins
// Utilities from element-plugin
export {
  ElementPlugin,
  elementFallbackRenderer,
  HTML_ELEMENTS,
  HTML_VOID_TAGS,
  isCustomComponent,
  isStdlibComponent,
  STDLIB_COMPONENTS,
  shouldBeVoid,
} from "./plugins/element-plugin";
export { SlashKit } from "./plugins/slash-kit";
export {
  initSourceSync,
  SourceSyncPlugin,
  updateSourceExternal,
} from "./plugins/source-sync-plugin";
// Converters
export {
  applyPlateChangesToSource,
  sourceToPlateValueSurgical,
  syncIdsFromSource,
} from "./surgical-converters";
// UI Components
export { BlockDraggable } from "./ui/block-draggable";
export { BlockSelection } from "./ui/block-selection";
export { Button } from "./ui/button";
export { SlashInputElement } from "./ui/slash-menu";
