export { BlockEditor } from "./BlockEditor";
export type { BlockEditorProps } from "./BlockEditor";

// Component utilities
export { getStdlibComponent, isStdlibComponent, getDefaultProps } from "./component-map";

// Converters
export { plateDocumentToJsxTree } from "./converters/plate-to-model";
export { jsxTreeToPlateDocument, createEmptyDocument } from "./converters/model-to-plate";

// Sync hook
export { useBlockEditorSync } from "./useBlockEditorSync";

// Props editing
export { PropsPanel } from "./PropsPanel";
export * from "./PropEditors";
