import { MarkdownPlugin, remarkMdx, remarkMention } from '@platejs/markdown';
import { KEYS } from 'platejs';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import type { MdxJsxFlowElement, MdxJsxTextElement, MdxJsxAttribute } from 'mdast-util-mdx-jsx';
import type { Text as MdastText } from 'mdast';

/**
 * Serialize rsc-block element to MDX <Block src="..." /> syntax
 *
 * TODO: Consolidate rsc-block handling into @hands/core/blocks package
 * Currently scattered across:
 *   - editor/mdx/parser.ts (parse <Block> → rsc-block)
 *   - editor/plate/plugins/markdown-kit.tsx (serialize rsc-block → <Block>) ← YOU ARE HERE
 *   - runtime/components/PageStatic.tsx (render rsc-block in PlateStatic)
 */
function serializeRscBlockToMdast(element: any): MdxJsxFlowElement | { type: 'html'; value: string } {
  // If we have the original source and NOT editing, use it to preserve formatting
  // This ensures round-trip consistency (parse → serialize produces identical output)
  // But if editing is true, we need to reconstruct to include the editing attribute
  if (element.source && !element.editing) {
    return { type: 'html', value: element.source };
  }

  // Reconstruct from blockId and props
  const attributes: MdxJsxAttribute[] = [];

  // Add src if we have a blockId
  if (element.blockId) {
    attributes.push({ type: 'mdxJsxAttribute', name: 'src', value: element.blockId });
  }

  // Add prompt if present (for editing blocks)
  if (element.prompt) {
    attributes.push({ type: 'mdxJsxAttribute', name: 'prompt', value: element.prompt });
  }

  // Add editing attribute if true (boolean attribute with null value)
  if (element.editing) {
    attributes.push({ type: 'mdxJsxAttribute', name: 'editing', value: null });
  }

  // Add additional props
  for (const [key, value] of Object.entries(element.blockProps || {})) {
    if (value === undefined || value === null) continue;
    if (value === true) {
      attributes.push({ type: 'mdxJsxAttribute', name: key, value: null });
    } else if (typeof value === 'string') {
      attributes.push({ type: 'mdxJsxAttribute', name: key, value });
    } else {
      // For numbers, objects, arrays - use expression syntax
      attributes.push({
        type: 'mdxJsxAttribute',
        name: key,
        value: {
          type: 'mdxJsxAttributeValueExpression',
          value: JSON.stringify(value),
        },
      });
    }
  }

  return {
    type: 'mdxJsxFlowElement',
    name: 'Block',
    attributes,
    children: [],
  };
}

/**
 * Serialize text with fontColor mark to <span style="color: ...">
 */
function serializeFontColorMark(node: any): MdxJsxTextElement | MdastText {
  const color = node.fontColor;
  if (!color) {
    return { type: 'text', value: node.text || '' };
  }

  return {
    type: 'mdxJsxTextElement',
    name: 'span',
    attributes: [
      {
        type: 'mdxJsxAttribute',
        name: 'style',
        value: `color: ${color};`,
      },
    ],
    children: [{ type: 'text', value: node.text || '' }],
  };
}

/**
 * Serialize text with fontBackgroundColor mark to <span style="background-color: ...">
 */
function serializeFontBackgroundColorMark(node: any): MdxJsxTextElement | MdastText {
  const bgColor = node.fontBackgroundColor;
  if (!bgColor) {
    return { type: 'text', value: node.text || '' };
  }

  return {
    type: 'mdxJsxTextElement',
    name: 'span',
    attributes: [
      {
        type: 'mdxJsxAttribute',
        name: 'style',
        value: `background-color: ${bgColor};`,
      },
    ],
    children: [{ type: 'text', value: node.text || '' }],
  };
}

export const MarkdownKit = [
  MarkdownPlugin.configure({
    options: {
      disallowedNodes: [KEYS.suggestion],
      remarkPlugins: [remarkMath, remarkGfm, remarkMdx, remarkMention],
      rules: {
        'rsc-block': {
          serialize: (element) => serializeRscBlockToMdast(element),
        },
        // Font color marks - serialize to <span style="color: ...">
        fontColor: {
          mark: true,
          serialize: (node) => serializeFontColorMark(node),
        },
        // Font background color marks - serialize to <span style="background-color: ...">
        fontBackgroundColor: {
          mark: true,
          serialize: (node) => serializeFontBackgroundColorMark(node),
        },
      },
    },
  }),
];
