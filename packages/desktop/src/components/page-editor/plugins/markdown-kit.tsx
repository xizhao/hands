'use client';

/**
 * MarkdownKit - Markdown serialization/deserialization plugin
 *
 * Provides markdown.serialize() and deserializeMd() APIs.
 * Uses remark plugins for GFM and MDX support.
 */

import { MarkdownPlugin, remarkMdx } from '@platejs/markdown';
import { KEYS } from 'platejs';
import remarkGfm from 'remark-gfm';
import type { MdxJsxTextElement, MdxJsxAttribute } from 'mdast-util-mdx-jsx';
import type { Text as MdastText } from 'mdast';

import { SANDBOXED_BLOCK_KEY, sandboxedBlockMarkdownRule } from '../SandboxedBlock';
import {
  liveQueryMarkdownRule,
  deserializeLiveQueryElement,
  deserializeInlineLiveQueryElement,
} from './live-query-kit';

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

/**
 * Deserialize <Block> MDX element to sandboxed_block Plate element
 */
function deserializeBlockElement(node: any) {
  // Extract attributes
  const attributes = node.attributes || [];
  const props: Record<string, any> = {};

  for (const attr of attributes) {
    if (attr.type === 'mdxJsxAttribute') {
      const name = attr.name;
      const value = attr.value;

      if (value === null || value === undefined) {
        props[name] = true; // Boolean attribute like "editing"
      } else if (typeof value === 'string') {
        props[name] = value;
      } else if (value?.type === 'mdxJsxAttributeValueExpression') {
        // Expression value like height={400}
        try {
          props[name] = JSON.parse(value.value);
        } catch {
          props[name] = value.value;
        }
      }
    }
  }

  return {
    type: SANDBOXED_BLOCK_KEY,
    src: props.src,
    editing: props.editing || undefined,
    prompt: props.prompt,
    height: typeof props.height === 'number' ? props.height : undefined,
    children: [{ text: '' }],
  };
}

export const MarkdownKit = [
  MarkdownPlugin.configure({
    options: {
      remarkPlugins: [remarkGfm, remarkMdx],
      rules: {
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
        // Block element - deserialize <Block src="..." /> to sandboxed_block
        Block: {
          deserialize: (node) => deserializeBlockElement(node),
        },
        // Sandboxed block - serialize to <Block src="..." />
        ...sandboxedBlockMarkdownRule,
        // LiveQuery element - deserialize <LiveQuery query="..." /> to live_query
        LiveQuery: {
          deserialize: (node, options) => deserializeLiveQueryElement(node, options),
        },
        // LiveValue (inline) element - deserialize <LiveValue query="..." /> to live_query_inline
        LiveValue: {
          deserialize: (node) => deserializeInlineLiveQueryElement(node),
        },
        // LiveQuery & LiveValue - serialize to MDX
        ...liveQueryMarkdownRule,
      },
    },
  }),
];
