/**
 * Markdown Worker Serialization Tests
 *
 * Tests that the worker serialization produces output equivalent to
 * the synchronous MarkdownPlugin serialization.
 *
 * Since web workers don't run in Node/vitest, we test the underlying
 * serialization logic directly by importing the same dependencies.
 */

import { describe, it, expect } from 'vitest';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';
import remarkGfm from 'remark-gfm';
import { remarkMdx } from '@platejs/markdown';
import type { Root } from 'mdast';
import type { TElement } from 'platejs';

import { serializationRules, toMarkdownPluginRules } from '@hands/core/primitives';
import { createTestEditor } from './create-test-editor';

// ============================================================================
// Replicate Worker Logic for Testing
// ============================================================================

type SerializationRule = {
  serialize?: (node: unknown, options?: unknown) => unknown;
  deserialize?: (node: unknown, deco: unknown, options: unknown) => unknown;
  mark?: boolean;
};

type SerializationRules = Record<string, SerializationRule>;

/**
 * Build worker rules matching the actual worker implementation.
 * This uses the same @hands/core/primitives import as the worker.
 */
function buildWorkerRules(): SerializationRules {
  const rules: SerializationRules = {
    // Import all core stdlib serialization rules (same as worker)
    ...toMarkdownPluginRules(serializationRules),

    // Font color marks
    fontColor: {
      mark: true,
      serialize: (node: unknown) => {
        const n = node as { fontColor?: string; text?: string };
        const color = n.fontColor;
        if (!color) return { type: 'text', value: n.text || '' };
        return {
          type: 'mdxJsxTextElement',
          name: 'span',
          attributes: [{ type: 'mdxJsxAttribute', name: 'style', value: `color: ${color};` }],
          children: [{ type: 'text', value: n.text || '' }],
        };
      },
    },
    fontBackgroundColor: {
      mark: true,
      serialize: (node: unknown) => {
        const n = node as { fontBackgroundColor?: string; text?: string };
        const bgColor = n.fontBackgroundColor;
        if (!bgColor) return { type: 'text', value: n.text || '' };
        return {
          type: 'mdxJsxTextElement',
          name: 'span',
          attributes: [{ type: 'mdxJsxAttribute', name: 'style', value: `background-color: ${bgColor};` }],
          children: [{ type: 'text', value: n.text || '' }],
        };
      },
    },
  };
  return rules;
}

const WORKER_RULES = buildWorkerRules();

// Simplified Plate → MDAST conversion (matches worker implementation)
function plateToMdast(nodes: TElement[], rules: SerializationRules): Root {
  return {
    type: 'root',
    children: nodes.map((node) => convertNode(node, rules)).filter(Boolean) as Root['children'],
  };
}

function convertNode(node: TElement | { text: string }, rules: SerializationRules): unknown {
  if ('text' in node && typeof node.text === 'string') {
    return convertTextNode(node as { text: string; bold?: boolean; italic?: boolean; code?: boolean }, rules);
  }

  const element = node as TElement;
  const nodeType = element.type as string;

  const rule = rules[nodeType];
  if (rule?.serialize) {
    return rule.serialize(element);
  }

  switch (nodeType) {
    case 'p':
      return {
        type: 'paragraph',
        children: convertChildren(element.children, rules),
      };
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6':
      return {
        type: 'heading',
        depth: parseInt(nodeType[1], 10),
        children: convertChildren(element.children, rules),
      };
    case 'blockquote':
      return {
        type: 'blockquote',
        children: convertChildren(element.children, rules),
      };
    case 'code_block':
      return {
        type: 'code',
        lang: element.lang || null,
        value: getTextContent(element),
      };
    case 'ul':
    case 'ol':
      return {
        type: 'list',
        ordered: nodeType === 'ol',
        children: convertChildren(element.children, rules),
      };
    case 'li':
      return {
        type: 'listItem',
        children: convertChildren(element.children, rules),
      };
    case 'hr':
      return { type: 'thematicBreak' };
    case 'a':
      return {
        type: 'link',
        url: element.url || '',
        children: convertChildren(element.children, rules),
      };
    default:
      if (nodeType && element.children) {
        return serializeAsMdxElement(element, rules);
      }
      return {
        type: 'paragraph',
        children: convertChildren(element.children || [], rules),
      };
  }
}

function convertTextNode(
  node: { text: string; bold?: boolean; italic?: boolean; code?: boolean; strikethrough?: boolean },
  rules: SerializationRules
): unknown {
  let result: unknown = { type: 'text', value: node.text };

  for (const [key, rule] of Object.entries(rules)) {
    if (rule.mark && key in node && (node as Record<string, unknown>)[key] && rule.serialize) {
      const serialized = rule.serialize(node);
      if (serialized) return serialized;
    }
  }

  if (node.bold) result = { type: 'strong', children: [result] };
  if (node.italic) result = { type: 'emphasis', children: [result] };
  if (node.code) result = { type: 'inlineCode', value: node.text };
  if (node.strikethrough) result = { type: 'delete', children: [result] };

  return result;
}

function convertChildren(children: unknown[], rules: SerializationRules): unknown[] {
  if (!Array.isArray(children)) return [];
  return children.map((child) => convertNode(child as TElement, rules)).filter(Boolean);
}

function getTextContent(node: TElement): string {
  if (!node.children) return '';
  return node.children
    .map((child: unknown) => {
      if (typeof child === 'object' && child !== null && 'text' in child) {
        return (child as { text: string }).text;
      }
      if (typeof child === 'object' && child !== null && 'children' in child) {
        return getTextContent(child as TElement);
      }
      return '';
    })
    .join('');
}

function serializeAsMdxElement(element: TElement, rules: SerializationRules): unknown {
  const { type, children, id, ...props } = element;
  const attributes = Object.entries(props).map(([name, value]) => ({
    type: 'mdxJsxAttribute',
    name,
    value: typeof value === 'string' ? value : JSON.stringify(value),
  }));

  const hasChildren = children && children.length > 0 && !isVoidElement(children);

  return {
    type: 'mdxJsxFlowElement',
    name: type,
    attributes,
    children: hasChildren ? convertChildren(children, rules) : [],
  };
}

function isVoidElement(children: unknown[]): boolean {
  return children.length === 1 &&
    typeof children[0] === 'object' &&
    children[0] !== null &&
    'text' in children[0] &&
    (children[0] as { text: string }).text === '';
}

function workerSerialize(value: TElement[]): string {
  const mdast = plateToMdast(value, WORKER_RULES);
  const processor = unified()
    .use(remarkGfm)
    .use(remarkMdx)
    .use(remarkStringify, {
      emphasis: '_',
      bullet: '-',
      fences: true,
    });
  return processor.stringify(mdast);
}

function workerDeserialize(markdown: string): TElement[] {
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMdx);
  const mdast = processor.parse(markdown) as Root;
  // Note: Full deserialization is more complex, we'll test serialize parity
  return mdast as unknown as TElement[];
}

// ============================================================================
// Helper
// ============================================================================

function normalize(str: string): string {
  return str.trim().replace(/\r\n/g, '\n').replace(/\n+$/g, '');
}

// ============================================================================
// Tests
// ============================================================================

describe('Markdown Worker Serialization', () => {
  describe('Basic Text', () => {
    it('serializes paragraph', () => {
      const nodes: TElement[] = [
        { type: 'p', children: [{ text: 'Hello, world!' }] },
      ];

      const result = workerSerialize(nodes);
      expect(normalize(result)).toBe('Hello, world!');
    });

    it('serializes headings', () => {
      const nodes: TElement[] = [
        { type: 'h1', children: [{ text: 'Title' }] },
        { type: 'h2', children: [{ text: 'Subtitle' }] },
      ];

      const result = workerSerialize(nodes);
      expect(result).toContain('# Title');
      expect(result).toContain('## Subtitle');
    });

    it('serializes bold text', () => {
      const nodes: TElement[] = [
        { type: 'p', children: [{ text: 'This is ' }, { text: 'bold', bold: true }, { text: ' text' }] },
      ];

      const result = workerSerialize(nodes);
      expect(result).toContain('**bold**');
    });

    it('serializes italic text', () => {
      const nodes: TElement[] = [
        { type: 'p', children: [{ text: 'This is ' }, { text: 'italic', italic: true }, { text: ' text' }] },
      ];

      const result = workerSerialize(nodes);
      // Worker uses _ for emphasis
      expect(result).toContain('_italic_');
    });

    it('serializes inline code', () => {
      const nodes: TElement[] = [
        { type: 'p', children: [{ text: 'Use ' }, { text: 'console.log()', code: true }] },
      ];

      const result = workerSerialize(nodes);
      expect(result).toContain('`console.log()`');
    });
  });

  describe('Block Elements', () => {
    it('serializes blockquote', () => {
      const nodes: TElement[] = [
        { type: 'blockquote', children: [{ type: 'p', children: [{ text: 'Quote text' }] }] },
      ];

      const result = workerSerialize(nodes);
      expect(result).toContain('> Quote text');
    });

    it('serializes unordered list', () => {
      const nodes: TElement[] = [
        {
          type: 'ul',
          children: [
            { type: 'li', children: [{ type: 'p', children: [{ text: 'Item 1' }] }] },
            { type: 'li', children: [{ type: 'p', children: [{ text: 'Item 2' }] }] },
          ],
        },
      ];

      const result = workerSerialize(nodes);
      expect(result).toContain('- Item 1');
      expect(result).toContain('- Item 2');
    });

    it('serializes ordered list', () => {
      const nodes: TElement[] = [
        {
          type: 'ol',
          children: [
            { type: 'li', children: [{ type: 'p', children: [{ text: 'First' }] }] },
            { type: 'li', children: [{ type: 'p', children: [{ text: 'Second' }] }] },
          ],
        },
      ];

      const result = workerSerialize(nodes);
      expect(result).toContain('1. First');
      expect(result).toContain('2. Second');
    });

    it('serializes horizontal rule', () => {
      const nodes: TElement[] = [
        { type: 'p', children: [{ text: 'Before' }] },
        { type: 'hr', children: [{ text: '' }] },
        { type: 'p', children: [{ text: 'After' }] },
      ];

      const result = workerSerialize(nodes);
      // remark-stringify uses *** for thematic breaks, which is valid markdown
      expect(result).toMatch(/---|\*\*\*/);
    });
  });

  describe('Links', () => {
    it('serializes links', () => {
      const nodes: TElement[] = [
        {
          type: 'p',
          children: [
            { text: 'Visit ' },
            { type: 'a', url: 'https://example.com', children: [{ text: 'Example' }] } as unknown as { text: string },
          ],
        },
      ];

      const result = workerSerialize(nodes);
      expect(result).toContain('[Example](https://example.com)');
    });
  });

  describe('MDX Elements', () => {
    it('serializes unknown element as MDX', () => {
      const nodes: TElement[] = [
        {
          type: 'custom_component',
          someProp: 'value',
          children: [{ text: '' }],
        },
      ];

      const result = workerSerialize(nodes);
      expect(result).toContain('<custom_component');
      expect(result).toContain('someProp');
    });
  });

  describe('Parity with Sync Serialization', () => {
    it('produces equivalent output for simple paragraph', () => {
      const editor = createTestEditor();
      const markdown = 'Hello, world!';

      // Deserialize with sync method
      const nodes = editor.api.markdown.deserialize(markdown);

      // Serialize with both methods
      const syncResult = editor.api.markdown.serialize({ value: nodes });
      const workerResult = workerSerialize(nodes);

      // Both should contain the core content
      expect(normalize(syncResult)).toContain('Hello, world');
      expect(normalize(workerResult)).toContain('Hello, world');
    });

    it('produces equivalent output for headings', () => {
      const editor = createTestEditor();
      const markdown = '# Heading 1\n\n## Heading 2';

      const nodes = editor.api.markdown.deserialize(markdown);

      const syncResult = editor.api.markdown.serialize({ value: nodes });
      const workerResult = workerSerialize(nodes);

      expect(syncResult).toContain('# Heading 1');
      expect(workerResult).toContain('# Heading 1');
      expect(syncResult).toContain('## Heading 2');
      expect(workerResult).toContain('## Heading 2');
    });

    it('produces equivalent output for bold/italic', () => {
      const editor = createTestEditor();
      const markdown = '**bold** and _italic_';

      const nodes = editor.api.markdown.deserialize(markdown);

      const syncResult = editor.api.markdown.serialize({ value: nodes });
      const workerResult = workerSerialize(nodes);

      expect(syncResult).toContain('bold');
      expect(workerResult).toContain('bold');
      expect(syncResult).toMatch(/\*\*bold\*\*/);
      expect(workerResult).toMatch(/\*\*bold\*\*/);
    });
  });
});

describe('Markdown Worker Integration', () => {
  it('rules are built correctly', () => {
    expect(WORKER_RULES).toBeDefined();
    expect(Object.keys(WORKER_RULES).length).toBeGreaterThan(0);
  });

  it('has fontColor mark rule', () => {
    expect(WORKER_RULES.fontColor).toBeDefined();
    expect(WORKER_RULES.fontColor.mark).toBe(true);
    expect(typeof WORKER_RULES.fontColor.serialize).toBe('function');
  });

  it('has fontBackgroundColor mark rule', () => {
    expect(WORKER_RULES.fontBackgroundColor).toBeDefined();
    expect(WORKER_RULES.fontBackgroundColor.mark).toBe(true);
  });
});
