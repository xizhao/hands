/**
 * Lightweight Block Source Parser (Browser-compatible)
 *
 * Extracts JSX from block TSX source using regex and simple parsing.
 * This is a simplified version that handles common block patterns.
 *
 * For full parsing with type information, use the server-side parser.
 */

import type { JsxNode, PropValue } from '../model';
import type { TElement } from 'platejs';
import { jsxTreeToPlateDocument, createEmptyDocument } from '../converters/model-to-plate';
import { STDLIB_COMPONENT_KEY } from '@/components/editor/plugins/stdlib-component-kit';
import { isStdlibComponent } from '../component-map';

/**
 * Extract the JSX return value from block source
 */
export function extractJsxFromSource(source: string): string | null {
  // Pattern 1: Arrow function with expression body
  // export default (async (ctx) => (<JSX>)) satisfies BlockFn;
  const arrowExprMatch = source.match(
    /export\s+default\s+\(?async\s*\([^)]*\)\s*=>\s*\(?([\s\S]*?)\)?(?:\s*\)\s*satisfies|\s*satisfies)/
  );
  if (arrowExprMatch) {
    return cleanJsxString(arrowExprMatch[1]);
  }

  // Pattern 2: Arrow function with block body and return
  // export default (async (ctx) => { return (<JSX>) }) satisfies BlockFn;
  const arrowBlockMatch = source.match(
    /return\s*\(?\s*([\s\S]*?)\s*\)?;?\s*\}\s*\)?\s*satisfies/
  );
  if (arrowBlockMatch) {
    return cleanJsxString(arrowBlockMatch[1]);
  }

  // Pattern 3: Regular function with return
  // async function Block(ctx) { return (<JSX>) }
  const funcMatch = source.match(
    /return\s*\(?\s*(<[\s\S]*?>[\s\S]*?<\/[^>]+>|<[^>]+\s*\/>)\s*\)?;?\s*\}/
  );
  if (funcMatch) {
    return cleanJsxString(funcMatch[1]);
  }

  return null;
}

/**
 * Clean up extracted JSX string
 */
function cleanJsxString(jsx: string): string {
  return jsx
    .trim()
    .replace(/^\(/, '')  // Remove leading paren
    .replace(/\)$/, '')  // Remove trailing paren
    .trim();
}

/**
 * Parse JSX string into JsxNode tree
 *
 * This is a simplified parser that handles:
 * - Self-closing elements: <Component prop="value" />
 * - Elements with children: <Component>...</Component>
 * - Fragments: <>...</>
 * - Text content
 * - Expression content: {variable}
 */
export function parseJsxString(jsx: string): JsxNode {
  jsx = jsx.trim();

  // Fragment: <>...</>
  if (jsx.startsWith('<>')) {
    const content = jsx.slice(2, -3).trim(); // Remove <> and </>
    return {
      id: generateId(),
      type: 'fragment',
      children: parseJsxChildren(content),
    };
  }

  // Self-closing element: <Tag ... />
  const selfClosingMatch = jsx.match(/^<(\w+)((?:\s+[^>]*?)?)\/>/s);
  if (selfClosingMatch) {
    const [, tagName, attrsStr] = selfClosingMatch;
    return {
      id: generateId(),
      type: 'element',
      tagName,
      props: parseAttributes(attrsStr),
      children: [],
    };
  }

  // Element with children: <Tag ...>...</Tag>
  const elementMatch = jsx.match(/^<(\w+)((?:\s+[^>]*?)??)>([\s\S]*)<\/\1>$/s);
  if (elementMatch) {
    const [, tagName, attrsStr, content] = elementMatch;
    return {
      id: generateId(),
      type: 'element',
      tagName,
      props: parseAttributes(attrsStr),
      children: parseJsxChildren(content),
    };
  }

  // Text or expression
  if (jsx.startsWith('{') && jsx.endsWith('}')) {
    return {
      id: generateId(),
      type: 'expression',
      expression: jsx.slice(1, -1),
    };
  }

  // Plain text
  return {
    id: generateId(),
    type: 'text',
    text: jsx,
  };
}

/**
 * Parse JSX children content
 */
function parseJsxChildren(content: string): JsxNode[] {
  content = content.trim();
  if (!content) return [];

  const children: JsxNode[] = [];
  let pos = 0;

  while (pos < content.length) {
    // Skip whitespace
    while (pos < content.length && /\s/.test(content[pos])) pos++;
    if (pos >= content.length) break;

    // Expression: {...}
    if (content[pos] === '{') {
      const endPos = findMatchingBrace(content, pos);
      if (endPos > pos) {
        const expr = content.slice(pos + 1, endPos);
        children.push({
          id: generateId(),
          type: 'expression',
          expression: expr.trim(),
        });
        pos = endPos + 1;
        continue;
      }
    }

    // Element: <...
    if (content[pos] === '<') {
      // Fragment: <>
      if (content[pos + 1] === '>') {
        const endPos = content.indexOf('</>', pos);
        if (endPos > pos) {
          const fragmentContent = content.slice(pos + 2, endPos);
          children.push({
            id: generateId(),
            type: 'fragment',
            children: parseJsxChildren(fragmentContent),
          });
          pos = endPos + 3;
          continue;
        }
      }

      // Self-closing or opening tag
      const tagMatch = content.slice(pos).match(/^<(\w+)((?:\s+[^>]*?)?)(\/?)>/s);
      if (tagMatch) {
        const [fullMatch, tagName, attrsStr, selfClose] = tagMatch;

        if (selfClose === '/') {
          // Self-closing
          children.push({
            id: generateId(),
            type: 'element',
            tagName,
            props: parseAttributes(attrsStr),
            children: [],
          });
          pos += fullMatch.length;
        } else {
          // Has children - find closing tag
          const closeTag = `</${tagName}>`;
          const closePos = findClosingTag(content, pos + fullMatch.length, tagName);
          if (closePos > pos) {
            const childContent = content.slice(pos + fullMatch.length, closePos);
            children.push({
              id: generateId(),
              type: 'element',
              tagName,
              props: parseAttributes(attrsStr),
              children: parseJsxChildren(childContent),
            });
            pos = closePos + closeTag.length;
          } else {
            pos += fullMatch.length;
          }
        }
        continue;
      }
    }

    // Text content - find next tag or expression
    const nextSpecial = content.slice(pos).search(/[<{]/);
    if (nextSpecial > 0) {
      const text = content.slice(pos, pos + nextSpecial).trim();
      if (text) {
        children.push({
          id: generateId(),
          type: 'text',
          text,
        });
      }
      pos += nextSpecial;
    } else if (nextSpecial === -1) {
      // Rest is text
      const text = content.slice(pos).trim();
      if (text) {
        children.push({
          id: generateId(),
          type: 'text',
          text,
        });
      }
      break;
    } else {
      pos++;
    }
  }

  return children;
}

/**
 * Find the position of a closing tag, accounting for nested same-name tags
 */
function findClosingTag(content: string, startPos: number, tagName: string): number {
  let depth = 1;
  let pos = startPos;
  const openTag = new RegExp(`<${tagName}(?:\\s|>|/>)`, 'g');
  const closeTag = `</${tagName}>`;

  while (pos < content.length && depth > 0) {
    const nextOpen = content.slice(pos).search(openTag);
    const nextClose = content.indexOf(closeTag, pos);

    if (nextClose === -1) return -1;

    if (nextOpen !== -1 && pos + nextOpen < nextClose) {
      // Found an opening tag first
      const match = content.slice(pos).match(openTag);
      if (match && !match[0].endsWith('/>')) {
        depth++;
      }
      pos = pos + nextOpen + 1;
    } else {
      // Found closing tag first
      depth--;
      if (depth === 0) return nextClose;
      pos = nextClose + closeTag.length;
    }
  }

  return -1;
}

/**
 * Find matching closing brace
 */
function findMatchingBrace(content: string, startPos: number): number {
  let depth = 1;
  let pos = startPos + 1;

  while (pos < content.length && depth > 0) {
    if (content[pos] === '{') depth++;
    else if (content[pos] === '}') depth--;
    if (depth > 0) pos++;
  }

  return depth === 0 ? pos : -1;
}

/**
 * Parse JSX attributes string into props
 */
function parseAttributes(attrsStr: string): Record<string, PropValue> {
  const props: Record<string, PropValue> = {};
  if (!attrsStr?.trim()) return props;

  // Match: name="value" or name={expr} or name
  const attrRegex = /(\w+)(?:=(?:"([^"]*)"|{([^}]*)})|(?=\s|$))/g;
  let match;

  while ((match = attrRegex.exec(attrsStr)) !== null) {
    const [, name, stringValue, exprValue] = match;

    if (stringValue !== undefined) {
      props[name] = { type: 'literal', value: stringValue };
    } else if (exprValue !== undefined) {
      // Try to parse as literal
      const trimmed = exprValue.trim();
      if (trimmed === 'true') {
        props[name] = { type: 'literal', value: true };
      } else if (trimmed === 'false') {
        props[name] = { type: 'literal', value: false };
      } else if (trimmed === 'null') {
        props[name] = { type: 'literal', value: null };
      } else if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
        props[name] = { type: 'literal', value: Number(trimmed) };
      } else if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
        // Array or object literal
        try {
          const parsed = JSON.parse(trimmed.replace(/'/g, '"'));
          props[name] = { type: 'literal', value: parsed };
        } catch {
          props[name] = { type: 'expression', value: trimmed, rawSource: trimmed };
        }
      } else {
        props[name] = { type: 'expression', value: trimmed, rawSource: trimmed };
      }
    } else {
      // Boolean shorthand
      props[name] = { type: 'literal', value: true };
    }
  }

  return props;
}

/**
 * Generate unique ID for nodes
 */
function generateId(): string {
  return `node_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Parse block source into Plate document
 *
 * Main entry point - extracts JSX from source and converts to Plate format
 */
export function parseBlockSourceToPlate(source: string): TElement[] {
  // Extract JSX from source
  const jsx = extractJsxFromSource(source);
  if (!jsx) {
    console.warn('[parser] Could not extract JSX from source');
    return createEmptyDocument();
  }

  // Parse JSX to JsxNode
  const jsxTree = parseJsxString(jsx);

  // Convert to Plate document
  return jsxTreeToPlateDocument(jsxTree);
}

/**
 * Check if source is a valid block file
 */
export function isValidBlockSource(source: string): boolean {
  return (
    source.includes('BlockFn') &&
    (source.includes('export default') || source.includes('module.exports'))
  );
}
