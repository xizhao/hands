import { MarkdownPlugin, remarkMdx, remarkMention } from '@platejs/markdown';
import { KEYS } from 'platejs';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';

/**
 * Serialize rsc-block element to MDX <Block src="..." /> syntax
 *
 * TODO: Consolidate rsc-block handling into @hands/core/blocks package
 * Currently scattered across:
 *   - editor/mdx/parser.ts (parse <Block> → rsc-block)
 *   - editor/plate/plugins/markdown-kit.tsx (serialize rsc-block → <Block>) ← YOU ARE HERE
 *   - runtime/components/PageStatic.tsx (render rsc-block in PlateStatic)
 */
function serializeRscBlock(element: any): string {
  // If we have the original source, use it (preserves formatting)
  if (element.source) {
    return element.source;
  }

  // Otherwise reconstruct from blockId and props
  const props = Object.entries(element.blockProps || {})
    .map(([key, value]) => {
      if (value === undefined || value === null) return '';
      if (value === true) return key;
      if (value === false) return '';
      if (typeof value === 'string') return `${key}="${value.replace(/"/g, '\\"')}"`;
      if (typeof value === 'number') return `${key}={${value}}`;
      return `${key}={${JSON.stringify(value)}}`;
    })
    .filter(Boolean)
    .join(' ');

  const propsStr = props ? ` ${props}` : '';
  return `<Block src="${element.blockId}"${propsStr} />`;
}

export const MarkdownKit = [
  MarkdownPlugin.configure({
    options: {
      disallowedNodes: [KEYS.suggestion],
      remarkPlugins: [remarkMath, remarkGfm, remarkMdx, remarkMention],
      elementRules: {
        'rsc-block': {
          serialize: (element) => serializeRscBlock(element),
        },
      },
    },
  }),
];
