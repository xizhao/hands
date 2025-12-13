/**
 * TSX Parser - Parse JSX/TSX source into JsxNode tree
 *
 * This is a lightweight browser-compatible parser that uses regex patterns
 * to extract JSX from source code. It handles common patterns but may not
 * cover all edge cases of full TypeScript parsing.
 */
import type { JsxNode, PropValue } from "../types";
import { generateId } from "../types";

/**
 * Parse a TSX source string into a JsxNode tree
 * Expects the source to be a block function like:
 * export default (ctx) => (<JSX>)
 */
export function parseSource(source: string): JsxNode {
  // Extract the JSX return value from the source
  const jsx = extractJsxFromSource(source);
  if (!jsx) {
    return createEmptyFragment();
  }

  return parseJsxString(jsx.trim());
}

/**
 * Extract JSX from source code
 * Handles various patterns:
 * - export default (ctx) => (<JSX>)
 * - export default async (ctx) => (<JSX>)
 * - export default function Name(ctx) { return <JSX> }
 */
export function extractJsxFromSource(source: string): string | null {
  // Pattern 1: Arrow function with expression body and parens
  // export default (async)? (ctx) => (<JSX>)
  const arrowExprMatch = source.match(
    /export\s+default\s+(?:async\s+)?\([^)]*\)\s*=>\s*\(\s*([\s\S]+)\s*\)\s*(?:satisfies|;|$)/,
  );
  if (arrowExprMatch) {
    return arrowExprMatch[1].trim();
  }

  // Pattern 2: Arrow function with expression body, no parens
  // export default (async)? (ctx) => <JSX>
  const arrowDirectMatch = source.match(
    /export\s+default\s+(?:async\s+)?\([^)]*\)\s*=>\s*(<[\s\S]+?>[\s\S]*<\/[^>]+>|<[^>]+\s*\/>)\s*(?:satisfies|;|$)/,
  );
  if (arrowDirectMatch) {
    return arrowDirectMatch[1].trim();
  }

  // Pattern 3: Arrow function with block body
  // export default (async)? (ctx) => { ... return <JSX> }
  const arrowBlockMatch = source.match(
    /export\s+default\s+(?:async\s+)?\([^)]*\)\s*=>\s*\{[\s\S]*return\s+([\s\S]+?)\s*;?\s*\}\s*(?:satisfies|;|$)/,
  );
  if (arrowBlockMatch) {
    return arrowBlockMatch[1].trim();
  }

  // Pattern 4: Function declaration
  // export default (async)? function Name(ctx) { ... return <JSX> }
  const funcMatch = source.match(
    /export\s+default\s+(?:async\s+)?function\s+\w*\s*\([^)]*\)\s*\{[\s\S]*return\s+([\s\S]+?)\s*;?\s*\}/,
  );
  if (funcMatch) {
    return funcMatch[1].trim();
  }

  // Pattern 5: Just JSX (for testing)
  if (source.trim().startsWith("<")) {
    return source.trim();
  }

  return null;
}

/**
 * Parse a JSX string into a JsxNode tree
 */
export function parseJsxString(jsx: string): JsxNode {
  jsx = jsx.trim();

  // Handle fragment: <>...</>
  if (jsx.startsWith("<>")) {
    return parseFragment(jsx);
  }

  // Handle expression: {...}
  if (jsx.startsWith("{") && jsx.endsWith("}")) {
    return {
      id: generateId(),
      type: "expression",
      expression: jsx.slice(1, -1).trim(),
    };
  }

  // Handle self-closing element: <Tag ... />
  const selfClosingMatch = jsx.match(/^<(\w+)((?:\s+[^>]*?)?)\s*\/>$/);
  if (selfClosingMatch) {
    const [, tagName, attrsStr] = selfClosingMatch;
    return {
      id: generateId(),
      type: "element",
      tagName,
      props: parseAttributes(attrsStr || ""),
      children: [],
    };
  }

  // Handle element with children: <Tag ...>...</Tag>
  const elementMatch = jsx.match(/^<(\w+)((?:\s+[^>]*?)?)>([\s\S]*)<\/\1>$/);
  if (elementMatch) {
    const [, tagName, attrsStr, childrenStr] = elementMatch;
    return {
      id: generateId(),
      type: "element",
      tagName,
      props: parseAttributes(attrsStr || ""),
      children: parseChildren(childrenStr),
    };
  }

  // Handle element with attributes that might contain > in expressions
  const tagMatch = jsx.match(/^<(\w+)/);
  if (tagMatch) {
    const tagName = tagMatch[1];
    const closeIndex = findClosingTag(jsx, tagName);

    if (closeIndex !== -1) {
      // Find where attributes end and children begin
      const attrsEndIndex = findAttributesEnd(jsx, tagName.length + 1);
      if (attrsEndIndex !== -1) {
        const attrsStr = jsx.slice(tagName.length + 1, attrsEndIndex);
        const childrenStr = jsx.slice(attrsEndIndex + 1, closeIndex);
        return {
          id: generateId(),
          type: "element",
          tagName,
          props: parseAttributes(attrsStr),
          children: parseChildren(childrenStr),
        };
      }
    }
  }

  // If we can't parse it, treat as text
  return {
    id: generateId(),
    type: "text",
    text: jsx,
  };
}

/**
 * Parse a fragment <>...</>
 */
function parseFragment(jsx: string): JsxNode {
  const match = jsx.match(/^<>([\s\S]*)<\/>$/);
  if (!match) {
    return createEmptyFragment();
  }

  return {
    id: generateId(),
    type: "fragment",
    children: parseChildren(match[1]),
  };
}

/**
 * Parse children from a string
 */
function parseChildren(childrenStr: string): JsxNode[] {
  const children: JsxNode[] = [];
  let remaining = childrenStr.trim();

  while (remaining.length > 0) {
    // Skip whitespace-only content
    const wsMatch = remaining.match(/^\s+/);
    if (wsMatch) {
      remaining = remaining.slice(wsMatch[0].length);
      if (remaining.length === 0) break;
    }

    // Expression: {...}
    if (remaining.startsWith("{")) {
      const endIndex = findMatchingBrace(remaining, 0);
      if (endIndex !== -1) {
        const expr = remaining.slice(1, endIndex).trim();
        children.push({
          id: generateId(),
          type: "expression",
          expression: expr,
        });
        remaining = remaining.slice(endIndex + 1).trim();
        continue;
      }
    }

    // Fragment: <>...</>
    if (remaining.startsWith("<>")) {
      const closeIndex = remaining.indexOf("</>");
      if (closeIndex !== -1) {
        const fragmentContent = remaining.slice(2, closeIndex);
        children.push({
          id: generateId(),
          type: "fragment",
          children: parseChildren(fragmentContent),
        });
        remaining = remaining.slice(closeIndex + 3).trim();
        continue;
      }
    }

    // Self-closing element: <Tag ... />
    const selfClosingMatch = remaining.match(/^<(\w+)((?:\s+[^>]*?)?)\s*\/>/);
    if (selfClosingMatch) {
      const [fullMatch, tagName, attrsStr] = selfClosingMatch;
      children.push({
        id: generateId(),
        type: "element",
        tagName,
        props: parseAttributes(attrsStr || ""),
        children: [],
      });
      remaining = remaining.slice(fullMatch.length).trim();
      continue;
    }

    // Element with children: <Tag ...>...</Tag>
    const tagMatch = remaining.match(/^<(\w+)/);
    if (tagMatch) {
      const tagName = tagMatch[1];
      const closeIndex = findClosingTag(remaining, tagName);

      if (closeIndex !== -1) {
        const elementStr = remaining.slice(0, closeIndex + tagName.length + 3);
        children.push(parseJsxString(elementStr));
        remaining = remaining.slice(elementStr.length).trim();
        continue;
      }
    }

    // Text content
    const textEnd = Math.min(
      remaining.indexOf("<") === -1 ? remaining.length : remaining.indexOf("<"),
      remaining.indexOf("{") === -1 ? remaining.length : remaining.indexOf("{"),
    );

    if (textEnd > 0) {
      const text = remaining.slice(0, textEnd).trim();
      if (text) {
        children.push({
          id: generateId(),
          type: "text",
          text,
        });
      }
      remaining = remaining.slice(textEnd).trim();
      continue;
    }

    // If we get stuck, break to avoid infinite loop
    break;
  }

  return children;
}

/**
 * Parse JSX attributes into props
 */
function parseAttributes(attrsStr: string): Record<string, PropValue> {
  const props: Record<string, PropValue> = {};
  let remaining = attrsStr.trim();

  while (remaining.length > 0) {
    // Skip whitespace
    remaining = remaining.trimStart();
    if (remaining.length === 0) break;

    // Spread attribute: {...obj}
    if (remaining.startsWith("{...")) {
      const endIndex = findMatchingBrace(remaining, 0);
      if (endIndex !== -1) {
        const spreadExpr = remaining.slice(4, endIndex);
        props["...spread"] = {
          type: "expression",
          value: spreadExpr,
          rawSource: `{...${spreadExpr}}`,
        };
        remaining = remaining.slice(endIndex + 1);
        continue;
      }
    }

    // Named attribute
    const nameMatch = remaining.match(/^([\w-]+)/);
    if (!nameMatch) break;

    const name = nameMatch[1];
    remaining = remaining.slice(name.length);

    // Check if it has a value
    if (!remaining.startsWith("=")) {
      // Boolean shorthand: <Input disabled />
      props[name] = { type: "literal", value: true };
      continue;
    }

    remaining = remaining.slice(1); // Skip =

    // String value: name="value" or name='value'
    if (remaining.startsWith('"') || remaining.startsWith("'")) {
      const quote = remaining[0];
      const endQuote = remaining.indexOf(quote, 1);
      if (endQuote !== -1) {
        props[name] = {
          type: "literal",
          value: remaining.slice(1, endQuote),
        };
        remaining = remaining.slice(endQuote + 1);
        continue;
      }
    }

    // Expression value: name={...}
    if (remaining.startsWith("{")) {
      const endIndex = findMatchingBrace(remaining, 0);
      if (endIndex !== -1) {
        const exprContent = remaining.slice(1, endIndex).trim();

        // Check if it's a simple literal
        const literalValue = tryParseLiteral(exprContent);
        if (literalValue !== undefined) {
          props[name] = { type: "literal", value: literalValue };
        } else {
          props[name] = {
            type: "expression",
            value: exprContent,
            rawSource: exprContent,
          };
        }
        remaining = remaining.slice(endIndex + 1);
        continue;
      }
    }

    // If we can't parse, break
    break;
  }

  return props;
}

/**
 * Try to parse a string as a literal value
 */
function tryParseLiteral(str: string): string | number | boolean | null | undefined {
  str = str.trim();

  if (str === "true") return true;
  if (str === "false") return false;
  if (str === "null") return null;

  // Number
  if (/^-?\d+(\.\d+)?$/.test(str)) {
    return parseFloat(str);
  }

  // String (with quotes)
  if ((str.startsWith('"') && str.endsWith('"')) || (str.startsWith("'") && str.endsWith("'"))) {
    return str.slice(1, -1);
  }

  return undefined;
}

/**
 * Find the matching closing brace for an opening brace
 */
function findMatchingBrace(str: string, startIndex: number): number {
  let depth = 0;
  let inString = false;
  let stringChar = "";

  for (let i = startIndex; i < str.length; i++) {
    const char = str[i];
    const prevChar = i > 0 ? str[i - 1] : "";

    // Handle strings
    if ((char === '"' || char === "'" || char === "`") && prevChar !== "\\") {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
      }
      continue;
    }

    if (inString) continue;

    if (char === "{") depth++;
    if (char === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }

  return -1;
}

/**
 * Find the closing tag for an element
 */
function findClosingTag(str: string, tagName: string): number {
  const closeTag = `</${tagName}>`;
  const openTag = `<${tagName}`;
  let depth = 0;
  let i = 0;

  while (i < str.length) {
    // Check for self-closing at current position
    if (str.slice(i).startsWith(openTag)) {
      // Check if self-closing
      const endBracket = str.indexOf(">", i + openTag.length);
      if (endBracket !== -1) {
        const tagContent = str.slice(i, endBracket + 1);
        if (tagContent.endsWith("/>")) {
          i = endBracket + 1;
          continue;
        }
        depth++;
        i = endBracket + 1;
        continue;
      }
    }

    if (str.slice(i).startsWith(closeTag)) {
      if (depth === 1) {
        return i;
      }
      depth--;
      i += closeTag.length;
      continue;
    }

    i++;
  }

  return -1;
}

/**
 * Find where attributes end (the closing > of the opening tag)
 */
function findAttributesEnd(str: string, startIndex: number): number {
  let inString = false;
  let stringChar = "";
  let braceDepth = 0;

  for (let i = startIndex; i < str.length; i++) {
    const char = str[i];
    const prevChar = i > 0 ? str[i - 1] : "";

    // Handle strings
    if ((char === '"' || char === "'" || char === "`") && prevChar !== "\\") {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
      }
      continue;
    }

    if (inString) continue;

    // Track braces for expressions in attributes
    if (char === "{") braceDepth++;
    if (char === "}") braceDepth--;

    // Check for self-closing
    if (char === "/" && str[i + 1] === ">") {
      return -1; // Self-closing, handled elsewhere
    }

    if (char === ">" && braceDepth === 0) {
      return i;
    }
  }

  return -1;
}

/**
 * Create an empty fragment node
 */
function createEmptyFragment(): JsxNode {
  return {
    id: generateId(),
    type: "fragment",
    children: [],
  };
}

/**
 * Check if source is a valid block
 */
export function isValidBlockSource(source: string): boolean {
  return extractJsxFromSource(source) !== null;
}
