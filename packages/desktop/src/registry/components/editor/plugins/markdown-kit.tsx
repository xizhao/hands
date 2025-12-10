import { MarkdownPlugin, remarkMdx, remarkMention } from '@platejs/markdown';
import { KEYS } from 'platejs';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';

import { BLOCK_KEY } from './block-kit';

// Helper to extract MDX JSX attributes as an object
function getMdxAttributes(node: any): Record<string, unknown> {
  const attrs: Record<string, unknown> = {};
  if (!node.attributes) return attrs;

  for (const attr of node.attributes) {
    if (attr.type === 'mdxJsxAttribute') {
      // String values
      if (typeof attr.value === 'string') {
        attrs[attr.name] = attr.value;
      }
      // Expression values like {10} or {true}
      else if (attr.value?.type === 'mdxJsxAttributeValueExpression') {
        try {
          // Try to parse simple JS values
          const val = attr.value.value;
          attrs[attr.name] = JSON.parse(val);
        } catch {
          attrs[attr.name] = attr.value.value;
        }
      }
      // Boolean attributes (presence = true)
      else if (attr.value === null) {
        attrs[attr.name] = true;
      }
    }
  }
  return attrs;
}

// Convert props to MDX JSX attributes format
// Following the same pattern as Platejs built-in rules (e.g., date)
function propsToMdxAttributes(props: Record<string, unknown>): any[] {
  return Object.entries(props).map(([name, value]) => {
    if (typeof value === 'string') {
      // String values: id="my-block"
      return { type: 'mdxJsxAttribute', name, value };
    }
    // Non-string values: count={5}
    return {
      type: 'mdxJsxAttribute',
      name,
      value: {
        type: 'mdxJsxAttributeValueExpression',
        value: JSON.stringify(value),
      },
    };
  });
}

export const MarkdownKit = [
  MarkdownPlugin.configure({
    options: {
      disallowedNodes: [KEYS.suggestion],
      remarkPlugins: [remarkMath, remarkGfm, remarkMdx, remarkMention],
      rules: {
        // MDX <Block> element -> Plate block element
        // Key "Block" is used for DESERIALIZE (MDX tag name)
        Block: {
          deserialize: (node: any) => {
            const attrs = getMdxAttributes(node);
            return {
              type: BLOCK_KEY,
              src: attrs.src as string,
              children: [{ text: '' }],
            };
          },
        },
        // Key "block" is used for SERIALIZE (Plate node type)
        [BLOCK_KEY]: {
          serialize: (node: any) => {
            // Only serialize user-defined props, filter out all Plate internals
            const userProps: Record<string, unknown> = {};

            for (const [key, value] of Object.entries(node)) {
              // Skip Plate internal fields
              if (
                key === 'type' ||
                key === 'children' ||
                key === 'id' ||        // Plate element ID
                key === '_id' ||       // Plate internal
                key.startsWith('_')    // Any other internal fields
              ) {
                continue;
              }
              userProps[key] = value;
            }

            // Return mdxJsxFlowElement: <Block src="welcome" />
            return {
              type: 'mdxJsxFlowElement',
              name: 'Block',
              attributes: propsToMdxAttributes(userProps),
              children: [],
            };
          },
        },
      },
    },
  }),
];
