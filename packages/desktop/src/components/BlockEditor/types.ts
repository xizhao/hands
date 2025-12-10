/**
 * Block Editor Types
 */

export interface JsxNode {
  id: string;
  type: "element" | "fragment" | "text" | "expression";
  tagName?: string;
  props?: Record<string, PropValue>;
  children?: JsxNode[];
  text?: string;
  expression?: string;
}

export interface PropValue {
  type: "literal" | "expression";
  value: unknown;
  rawSource?: string;
}

export interface DragItem {
  type: "node" | "palette";
  nodeId?: string;
  nodeType?: string;
}

export interface DropResult {
  targetId: string;
  position: "before" | "after" | "inside";
}
