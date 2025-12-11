/**
 * Plate Document to BlockModel Converter
 *
 * Converts Plate editor elements to JsxNode tree for code generation.
 */

import type { TElement } from 'platejs';
import type { JsxNode, PropValue } from '../model';
import {
  createElementNode,
  createTextNode,
  createExpressionValue,
  createLiteralValue,
} from '../model';
import type { StdlibComponentElement } from '@/components/editor/plate-types';
import { STDLIB_COMPONENT_KEY } from '@/components/editor/plugins/stdlib-component-kit';
import { isStdlibComponent } from '@/components/BlockEditor/component-map';

/**
 * Convert a Plate element prop value to a JsxNode PropValue
 */
function convertPropValue(value: unknown): PropValue {
  if (value === null || value === undefined) {
    return createLiteralValue(null);
  }

  if (typeof value === 'string') {
    return createLiteralValue(value);
  }

  if (typeof value === 'number') {
    return createLiteralValue(value);
  }

  if (typeof value === 'boolean') {
    return createLiteralValue(value);
  }

  // Arrays and objects become expressions
  if (Array.isArray(value) || typeof value === 'object') {
    return createExpressionValue(JSON.stringify(value));
  }

  return createExpressionValue(String(value));
}

/**
 * Convert Plate element props to JsxNode props
 */
function convertProps(props: Record<string, unknown>): Record<string, PropValue> {
  const result: Record<string, PropValue> = {};

  for (const [key, value] of Object.entries(props)) {
    // Skip internal Plate properties
    if (key === 'type' || key === 'children' || key === 'id') continue;

    result[key] = convertPropValue(value);
  }

  return result;
}

/**
 * Convert a StdlibComponentElement to a JsxNode
 */
function convertStdlibComponent(element: StdlibComponentElement): JsxNode {
  const jsxProps = convertProps(element.props);

  return createElementNode(element.componentName, jsxProps, []);
}

/**
 * Convert a Plate text node to JsxNode
 */
function convertTextNode(text: { text: string }): JsxNode | null {
  if (!text.text || text.text.trim() === '') {
    return null;
  }

  return createTextNode(text.text);
}

/**
 * Convert a generic Plate element to JsxNode
 */
function convertElement(element: TElement): JsxNode | null {
  // Handle stdlib components
  if (element.type === STDLIB_COMPONENT_KEY) {
    return convertStdlibComponent(element as StdlibComponentElement);
  }

  // Handle paragraph/text blocks - extract text content
  if (element.type === 'p' || element.type === 'paragraph') {
    const children: JsxNode[] = [];

    for (const child of element.children || []) {
      if ('text' in child) {
        const textNode = convertTextNode(child as { text: string });
        if (textNode) {
          children.push(textNode);
        }
      }
    }

    // If paragraph only contains text, return a simple div with text
    if (children.length === 1 && children[0].type === 'text') {
      return createElementNode('p', {}, children);
    }

    // Return paragraph with children
    return createElementNode('p', {}, children);
  }

  // Handle heading elements
  if (element.type === 'h1' || element.type === 'h2' || element.type === 'h3') {
    const children: JsxNode[] = [];

    for (const child of element.children || []) {
      if ('text' in child) {
        const textNode = convertTextNode(child as { text: string });
        if (textNode) {
          children.push(textNode);
        }
      }
    }

    return createElementNode(element.type, {}, children);
  }

  // Handle unknown element types - convert to div
  const children: JsxNode[] = [];

  for (const child of element.children || []) {
    if ('type' in child) {
      const converted = convertElement(child as TElement);
      if (converted) {
        children.push(converted);
      }
    } else if ('text' in child) {
      const textNode = convertTextNode(child as { text: string });
      if (textNode) {
        children.push(textNode);
      }
    }
  }

  return createElementNode('div', convertProps(element as Record<string, unknown>), children);
}

/**
 * Convert an array of Plate elements to a JsxNode tree
 *
 * Returns a root fragment or element containing all converted nodes.
 */
export function plateDocumentToJsxTree(document: TElement[]): JsxNode {
  const children: JsxNode[] = [];

  for (const element of document) {
    const converted = convertElement(element);
    if (converted) {
      children.push(converted);
    }
  }

  // If single child, return it directly
  if (children.length === 1) {
    return children[0];
  }

  // Wrap multiple children in a fragment
  return {
    id: `root_${Date.now().toString(36)}`,
    type: 'fragment',
    children,
  };
}

/**
 * Check if a Plate document contains any stdlib components
 */
export function hasStdlibComponents(document: TElement[]): boolean {
  function checkElement(element: TElement): boolean {
    if (element.type === STDLIB_COMPONENT_KEY) {
      return true;
    }

    for (const child of element.children || []) {
      if ('type' in child && checkElement(child as TElement)) {
        return true;
      }
    }

    return false;
  }

  return document.some(checkElement);
}
