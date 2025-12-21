'use client';

/**
 * MarkdownKit - Markdown serialization/deserialization plugin
 *
 * Provides markdown.serialize() and deserializeMd() APIs.
 * Uses remark plugins for GFM and MDX support.
 *
 * Note: This is the base markdown kit. Desktop-specific rules (like Block, Prompt)
 * should be added in the desktop's editor-kit.ts configuration.
 */

import { MarkdownPlugin, remarkMdx } from '@platejs/markdown';
import remarkGfm from 'remark-gfm';
import type { MdxJsxTextElement } from 'mdast-util-mdx-jsx';
import type { Text as MdastText } from 'mdast';
import type { TText } from 'platejs';

import { serializationRules, toMarkdownPluginRules } from '@hands/core/stdlib';

// ============================================================================
// Types
// ============================================================================

/** Text node with font color mark */
interface FontColorTextNode extends TText {
  fontColor?: string;
}

/** Text node with font background color mark */
interface FontBackgroundColorTextNode extends TText {
  fontBackgroundColor?: string;
}

/** Markdown serialization rule - accepts both mark and element serializers */
export interface MarkdownRule {
  mark?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  serialize?: (node: any) => any;
  deserialize?: unknown;
}

// ============================================================================
// Serializers
// ============================================================================

/**
 * Serialize text with fontColor mark to <span style="color: ...">
 */
function serializeFontColorMark(node: FontColorTextNode): MdxJsxTextElement | MdastText {
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
function serializeFontBackgroundColorMark(node: FontBackgroundColorTextNode): MdxJsxTextElement | MdastText {
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

/** Base markdown rules (stdlib + font marks) */
export const baseMarkdownRules: Record<string, MarkdownRule> = {
  // Import all core stdlib serialization rules
  ...toMarkdownPluginRules(serializationRules),

  // Font color marks - serialize to <span style="color: ...">
  fontColor: {
    mark: true,
    serialize: (node: TText) => serializeFontColorMark(node as FontColorTextNode),
  },

  // Font background color marks - serialize to <span style="background-color: ...">
  fontBackgroundColor: {
    mark: true,
    serialize: (node: TText) => serializeFontBackgroundColorMark(node as FontBackgroundColorTextNode),
  },
};

/**
 * Create MarkdownKit with additional rules.
 * Use this when you need custom serialization (e.g., Block, Prompt elements).
 */
export function createMarkdownKit(additionalRules: Record<string, MarkdownRule> = {}) {
  const combinedRules = {
    ...baseMarkdownRules,
    ...additionalRules,
  };

  return [
    MarkdownPlugin.configure({
      options: {
        remarkPlugins: [remarkGfm, remarkMdx],
        // Type assertion needed as MarkdownRule is compatible but not identical to MdRules
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        rules: combinedRules as any,
      },
    }),
  ];
}

/** Default MarkdownKit with stdlib rules */
export const MarkdownKit = createMarkdownKit();
