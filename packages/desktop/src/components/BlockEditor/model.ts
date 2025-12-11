/**
 * JSX Node Model Types
 *
 * Local type definitions for JSX node representation.
 * Used for converting between Plate elements and code generation.
 */

// ============================================================================
// Prop Value Types
// ============================================================================

export interface LiteralPropValue {
  type: 'literal';
  value: string | number | boolean | null | unknown[] | Record<string, unknown>;
}

export interface ExpressionPropValue {
  type: 'expression';
  value: string;
  rawSource?: string;
}

export interface JsxPropValue {
  type: 'jsx';
  value: JsxNode;
}

export type PropValue = LiteralPropValue | ExpressionPropValue | JsxPropValue;

// ============================================================================
// JSX Node Types
// ============================================================================

export interface JsxNodeBase {
  id: string;
}

export interface JsxTextNode extends JsxNodeBase {
  type: 'text';
  text: string;
}

export interface JsxExpressionNode extends JsxNodeBase {
  type: 'expression';
  expression: string;
}

export interface JsxElementNode extends JsxNodeBase {
  type: 'element';
  tagName: string;
  props?: Record<string, PropValue>;
  children?: JsxNode[];
}

export interface JsxFragmentNode extends JsxNodeBase {
  type: 'fragment';
  children?: JsxNode[];
}

export type JsxNode = JsxTextNode | JsxExpressionNode | JsxElementNode | JsxFragmentNode;

// ============================================================================
// Factory Functions
// ============================================================================

let nodeIdCounter = 0;

function generateNodeId(): string {
  return `node_${Date.now().toString(36)}_${(nodeIdCounter++).toString(36)}`;
}

/**
 * Create a text node
 */
export function createTextNode(text: string): JsxTextNode {
  return {
    id: generateNodeId(),
    type: 'text',
    text,
  };
}

/**
 * Create an element node
 */
export function createElementNode(
  tagName: string,
  props: Record<string, PropValue> = {},
  children: JsxNode[] = []
): JsxElementNode {
  return {
    id: generateNodeId(),
    type: 'element',
    tagName,
    props,
    children,
  };
}

/**
 * Create a fragment node
 */
export function createFragmentNode(children: JsxNode[] = []): JsxFragmentNode {
  return {
    id: generateNodeId(),
    type: 'fragment',
    children,
  };
}

/**
 * Create an expression node
 */
export function createExpressionNode(expression: string): JsxExpressionNode {
  return {
    id: generateNodeId(),
    type: 'expression',
    expression,
  };
}

/**
 * Create a literal prop value
 */
export function createLiteralValue(
  value: string | number | boolean | null | unknown[] | Record<string, unknown>
): LiteralPropValue {
  return {
    type: 'literal',
    value,
  };
}

/**
 * Create an expression prop value
 */
export function createExpressionValue(value: string, rawSource?: string): ExpressionPropValue {
  return {
    type: 'expression',
    value,
    rawSource,
  };
}

/**
 * Create a JSX prop value
 */
export function createJsxValue(value: JsxNode): JsxPropValue {
  return {
    type: 'jsx',
    value,
  };
}
