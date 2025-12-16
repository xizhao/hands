import { MarkdownPlugin, remarkMdx, remarkMention } from '@platejs/markdown';
import { KEYS } from 'platejs';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import type { MdxJsxFlowElement, MdxJsxAttribute } from 'mdast-util-mdx-jsx';

/**
 * Serialize rsc-block element to MDX <Block src="..." /> syntax
 *
 * TODO: Consolidate rsc-block handling into @hands/core/blocks package
 * Currently scattered across:
 *   - editor/mdx/parser.ts (parse <Block> → rsc-block)
 *   - editor/plate/plugins/markdown-kit.tsx (serialize rsc-block → <Block>) ← YOU ARE HERE
 *   - runtime/components/PageStatic.tsx (render rsc-block in PlateStatic)
 */
function serializeRscBlockToMdast(element: any): MdxJsxFlowElement {
  // Build JSX attributes array
  const attributes: MdxJsxAttribute[] = [
    { type: 'mdxJsxAttribute', name: 'src', value: element.blockId },
  ];

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

export const MarkdownKit = [
  MarkdownPlugin.configure({
    options: {
      disallowedNodes: [KEYS.suggestion],
      remarkPlugins: [remarkMath, remarkGfm, remarkMdx, remarkMention],
      rules: {
        'rsc-block': {
          serialize: (element) => serializeRscBlockToMdast(element),
        },
      },
    },
  }),
];
