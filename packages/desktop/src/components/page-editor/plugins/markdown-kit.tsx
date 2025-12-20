'use client';

/**
 * MarkdownKit - Markdown serialization/deserialization plugin
 *
 * Provides markdown.serialize() and deserializeMd() APIs.
 * Uses remark plugins for GFM and MDX support.
 */

import { MarkdownPlugin, remarkMdx, convertChildrenDeserialize, convertNodesSerialize } from '@platejs/markdown';
import { KEYS } from 'platejs';
import remarkGfm from 'remark-gfm';
import type { MdxJsxTextElement, MdxJsxAttribute } from 'mdast-util-mdx-jsx';
import type { Text as MdastText } from 'mdast';

import { SANDBOXED_BLOCK_KEY, sandboxedBlockMarkdownRule } from '../SandboxedBlock';
import {
  liveQueryMarkdownRule,
  deserializeLiveValue,
  deserializeLiveActionElement,
  deserializeActionButtonElement,
  LIVE_ACTION_KEY,
  ACTION_BUTTON_KEY,
  type TLiveActionElement,
  type TActionButtonElement,
} from './live-query-kit';
import { PROMPT_KEY } from './prompt-kit';

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
        // LiveValue - inline element, display prop controls rendering
        LiveValue: {
          deserialize: (node) => deserializeLiveValue(node),
        },
        // Legacy MDX tag - maps to LiveValue
        LiveQuery: {
          deserialize: (node) => deserializeLiveValue(node),
        },
        // LiveAction element - non-void, has children
        LiveAction: {
          deserialize: (node, deco, options) => {
            const children = convertChildrenDeserialize(node.children || [], deco, options);
            return deserializeLiveActionElement(node, { children });
          },
        },
        // ActionButton element - non-void, has children (button text/content)
        ActionButton: {
          deserialize: (node, deco, options) => {
            const children = convertChildrenDeserialize(node.children || [], deco, options);
            return deserializeActionButtonElement(node, { children });
          },
        },
        // Serialize all live elements to MDX
        ...liveQueryMarkdownRule,
        // Override LiveAction serialization to properly serialize children
        [LIVE_ACTION_KEY]: {
          serialize: (node: TLiveActionElement, options: any) => {
            const attributes: Array<{ type: 'mdxJsxAttribute'; name: string; value: unknown }> = [];

            if (node.sql) {
              attributes.push({ type: 'mdxJsxAttribute', name: 'sql', value: node.sql });
            }
            if (node.src) {
              attributes.push({ type: 'mdxJsxAttribute', name: 'src', value: node.src });
            }
            if (node.params && Object.keys(node.params).length > 0) {
              attributes.push({
                type: 'mdxJsxAttribute',
                name: 'params',
                value: { type: 'mdxJsxAttributeValueExpression', value: JSON.stringify(node.params) },
              });
            }

            // Recursively serialize children
            const children = convertNodesSerialize(node.children || [], options);

            return {
              type: 'mdxJsxFlowElement',
              name: 'LiveAction',
              attributes,
              children,
            };
          },
        },
        // Override ActionButton serialization to properly serialize children
        [ACTION_BUTTON_KEY]: {
          serialize: (node: TActionButtonElement, options: any) => {
            const attributes: Array<{ type: 'mdxJsxAttribute'; name: string; value: unknown }> = [];

            if (node.variant && node.variant !== 'default') {
              attributes.push({ type: 'mdxJsxAttribute', name: 'variant', value: node.variant });
            }

            // Recursively serialize children
            const children = convertNodesSerialize(node.children || [], options);

            return {
              type: 'mdxJsxTextElement',
              name: 'ActionButton',
              attributes,
              children,
            };
          },
        },
        // Prompt element - deserialize <Prompt text="..." /> or <Prompt threadId="..." />
        Prompt: {
          deserialize: (node: any) => {
            const attrs = node.attributes || [];
            let promptText: string | undefined;
            let threadId: string | undefined;
            for (const attr of attrs) {
              if (attr.type === 'mdxJsxAttribute') {
                if (attr.name === 'text') {
                  promptText = attr.value || undefined;
                } else if (attr.name === 'threadId') {
                  threadId = attr.value || undefined;
                }
              }
            }
            return {
              type: PROMPT_KEY,
              promptText,
              threadId,
              children: [{ text: '' }],
            };
          },
        },
        // Serialize Prompt element to MDX
        [PROMPT_KEY]: {
          serialize: (node: any) => {
            const attrs: MdxJsxAttribute[] = [];
            // Only include text OR threadId, not both
            if (node.threadId) {
              attrs.push({ type: 'mdxJsxAttribute', name: 'threadId', value: node.threadId });
            } else if (node.promptText) {
              attrs.push({ type: 'mdxJsxAttribute', name: 'text', value: node.promptText });
            }
            return {
              type: 'mdxJsxFlowElement',
              name: 'Prompt',
              attributes: attrs,
              children: [],
            };
          },
        },
      },
    },
  }),
];
