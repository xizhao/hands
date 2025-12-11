/**
 * BlockModel to Plate Document Converter
 *
 * Converts JsxNode tree to Plate editor elements for visual editing.
 */

import type { TElement } from 'platejs';
import type { JsxNode, PropValue } from '../model';
import type { StdlibComponentElement } from '@/components/editor/plate-types';
import { STDLIB_COMPONENT_KEY } from '@/components/editor/plugins/stdlib-component-kit';
import { isStdlibComponent } from '@/components/BlockEditor/component-map';

/**
 * Convert a PropValue to a plain JavaScript value
 */
function convertPropValue(propValue: PropValue): unknown {
  if (propValue.type === 'literal') {
    return propValue.value;
  }

  if (propValue.type === 'expression') {
    // Try to parse expression as JSON for arrays/objects
    if (typeof propValue.value === 'string') {
      try {
        return JSON.parse(propValue.value);
      } catch {
        // Return raw expression string if not valid JSON
        return propValue.value;
      }
    }
    return propValue.value;
  }

  if (propValue.type === 'jsx') {
    // JSX values stay as-is for now (could be nested components)
    return propValue.value;
  }

  return propValue.value;
}

/**
 * Convert JsxNode props to Plate element props
 */
function convertProps(props?: Record<string, PropValue>): Record<string, unknown> {
  if (!props) return {};

  const result: Record<string, unknown> = {};

  for (const [key, propValue] of Object.entries(props)) {
    result[key] = convertPropValue(propValue);
  }

  return result;
}

/**
 * Check if a JsxNode represents a stdlib component
 */
function isStdlibComponentNode(node: JsxNode): boolean {
  if (node.type !== 'element' || !node.tagName) return false;

  return isStdlibComponent(node.tagName);
}

/**
 * Convert a stdlib component JsxNode to StdlibComponentElement
 */
function convertStdlibComponentNode(node: JsxNode): StdlibComponentElement {
  return {
    type: STDLIB_COMPONENT_KEY,
    componentName: node.tagName!,
    props: convertProps(node.props) as Record<string, unknown>,
    children: [{ text: '' }],
  };
}

/**
 * Convert a text JsxNode to Plate text
 */
function convertTextNode(node: JsxNode): { text: string } {
  return { text: node.text || '' };
}

/**
 * Convert an expression JsxNode to a placeholder element
 */
function convertExpressionNode(node: JsxNode): TElement {
  // Expressions become code blocks or inline code
  return {
    type: 'code_block',
    children: [{ text: node.expression || '' }],
  };
}

/**
 * Convert a generic element JsxNode to Plate element
 */
function convertElementNode(node: JsxNode): TElement {
  // Check if this is a stdlib component
  if (isStdlibComponentNode(node)) {
    return convertStdlibComponentNode(node);
  }

  // Map common HTML elements to Plate types
  const tagName = node.tagName?.toLowerCase();

  // Headings
  if (tagName === 'h1') {
    return {
      type: 'h1',
      children: convertChildren(node.children),
    };
  }
  if (tagName === 'h2') {
    return {
      type: 'h2',
      children: convertChildren(node.children),
    };
  }
  if (tagName === 'h3') {
    return {
      type: 'h3',
      children: convertChildren(node.children),
    };
  }

  // Paragraph
  if (tagName === 'p' || tagName === 'div' || tagName === 'span') {
    return {
      type: 'p',
      children: convertChildren(node.children),
    };
  }

  // Blockquote
  if (tagName === 'blockquote') {
    return {
      type: 'blockquote',
      children: convertChildren(node.children),
    };
  }

  // Lists
  if (tagName === 'ul') {
    return {
      type: 'ul',
      children: convertChildren(node.children),
    };
  }
  if (tagName === 'ol') {
    return {
      type: 'ol',
      children: convertChildren(node.children),
    };
  }
  if (tagName === 'li') {
    return {
      type: 'li',
      children: convertChildren(node.children),
    };
  }

  // Default: treat as paragraph with the element's props
  const props = convertProps(node.props);

  return {
    type: 'p',
    ...props,
    children: convertChildren(node.children),
  };
}

/**
 * Convert JsxNode children to Plate children
 */
function convertChildren(children?: JsxNode[]): (TElement | { text: string })[] {
  if (!children || children.length === 0) {
    return [{ text: '' }];
  }

  const result: (TElement | { text: string })[] = [];

  for (const child of children) {
    const converted = convertNode(child);
    if (converted) {
      if (Array.isArray(converted)) {
        result.push(...converted);
      } else {
        result.push(converted);
      }
    }
  }

  // Ensure at least one text node
  if (result.length === 0) {
    return [{ text: '' }];
  }

  return result;
}

/**
 * Convert a single JsxNode to Plate element(s)
 */
function convertNode(node: JsxNode): TElement | { text: string } | TElement[] | null {
  switch (node.type) {
    case 'text':
      return convertTextNode(node);

    case 'expression':
      return convertExpressionNode(node);

    case 'element':
      return convertElementNode(node);

    case 'fragment':
      // Fragments become multiple elements
      if (node.children && node.children.length > 0) {
        const elements: TElement[] = [];
        for (const child of node.children) {
          const converted = convertNode(child);
          if (converted) {
            if (Array.isArray(converted)) {
              elements.push(...converted);
            } else if ('type' in converted) {
              elements.push(converted);
            } else {
              // Wrap text in paragraph
              elements.push({
                type: 'p',
                children: [converted],
              });
            }
          }
        }
        return elements;
      }
      return null;

    default:
      return null;
  }
}

/**
 * Convert a JsxNode tree to a Plate document (array of elements)
 */
export function jsxTreeToPlateDocument(root: JsxNode): TElement[] {
  const converted = convertNode(root);

  if (!converted) {
    // Return empty paragraph as default
    return [{ type: 'p', children: [{ text: '' }] }];
  }

  if (Array.isArray(converted)) {
    return converted;
  }

  if ('type' in converted) {
    return [converted];
  }

  // Wrap text in paragraph
  return [{ type: 'p', children: [converted] }];
}

/**
 * Create an empty Plate document
 */
export function createEmptyDocument(): TElement[] {
  return [{ type: 'p', children: [{ text: '' }] }];
}

/**
 * Create a document with a single stdlib component
 */
export function createComponentDocument(componentName: string, props: Record<string, unknown> = {}): TElement[] {
  const element: StdlibComponentElement = {
    type: STDLIB_COMPONENT_KEY,
    componentName,
    props,
    children: [{ text: '' }],
  };

  return [element];
}
