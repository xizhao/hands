'use client';

/**
 * MarkdownKit - Markdown serialization/deserialization plugin
 *
 * Provides markdown.serialize() and deserializeMd() APIs.
 * Uses remark plugins for GFM and MDX support.
 */

import { MarkdownPlugin, remarkMdx, convertChildrenDeserialize } from '@platejs/markdown';
import remarkGfm from 'remark-gfm';
import type { MdxJsxTextElement, MdxJsxAttribute } from 'mdast-util-mdx-jsx';
import type { Text as MdastText } from 'mdast';

import { SANDBOXED_BLOCK_KEY, sandboxedBlockMarkdownRule } from '../SandboxedBlock';
import {
  liveQueryMarkdownRule,
  deserializeLiveValue,
  deserializeLiveActionElement,
  deserializeButtonElement,
  deserializeInputElement,
  deserializeSelectElement,
  deserializeCheckboxElement,
  deserializeTextareaElement,
} from './live-query-kit';
import {
  cardMarkdownRule,
  deserializeCardElement,
  deserializeCardHeaderElement,
  deserializeCardContentElement,
  deserializeCardFooterElement,
  deserializeCardTitleElement,
  deserializeCardDescriptionElement,
} from './card-kit';
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
        // Button element - non-void, has children (button text/content)
        Button: {
          deserialize: (node, deco, options) => {
            const children = convertChildrenDeserialize(node.children || [], deco, options);
            return deserializeButtonElement(node, { children });
          },
        },
        // Input element - non-void, children are the label text
        Input: {
          deserialize: (node, deco, options) => {
            const children = convertChildrenDeserialize(node.children || [], deco, options);
            return deserializeInputElement(node, { children });
          },
        },
        // Select element - non-void, children are the label text
        Select: {
          deserialize: (node, deco, options) => {
            const children = convertChildrenDeserialize(node.children || [], deco, options);
            return deserializeSelectElement(node, { children });
          },
        },
        // Checkbox element - non-void, children are the label text
        Checkbox: {
          deserialize: (node, deco, options) => {
            const children = convertChildrenDeserialize(node.children || [], deco, options);
            return deserializeCheckboxElement(node, { children });
          },
        },
        // Textarea element - non-void, children are the label text
        Textarea: {
          deserialize: (node, deco, options) => {
            const children = convertChildrenDeserialize(node.children || [], deco, options);
            return deserializeTextareaElement(node, { children });
          },
        },
        // Card layout components - non-void, children are content
        Card: {
          deserialize: (node, deco, options) => {
            const children = convertChildrenDeserialize(node.children || [], deco, options);
            return deserializeCardElement(node, { children });
          },
        },
        CardHeader: {
          deserialize: (node, deco, options) => {
            const children = convertChildrenDeserialize(node.children || [], deco, options);
            return deserializeCardHeaderElement(node, { children });
          },
        },
        CardContent: {
          deserialize: (node, deco, options) => {
            const children = convertChildrenDeserialize(node.children || [], deco, options);
            return deserializeCardContentElement(node, { children });
          },
        },
        CardFooter: {
          deserialize: (node, deco, options) => {
            const children = convertChildrenDeserialize(node.children || [], deco, options);
            return deserializeCardFooterElement(node, { children });
          },
        },
        CardTitle: {
          deserialize: (node, deco, options) => {
            const children = convertChildrenDeserialize(node.children || [], deco, options);
            return deserializeCardTitleElement(node, { children });
          },
        },
        CardDescription: {
          deserialize: (node, deco, options) => {
            const children = convertChildrenDeserialize(node.children || [], deco, options);
            return deserializeCardDescriptionElement(node, { children });
          },
        },
        // Serialize all live elements to MDX
        ...liveQueryMarkdownRule,
        // Serialize Card elements to MDX
        ...cardMarkdownRule,
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
