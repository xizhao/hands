/**
 * Block documentation for agents
 *
 * NOTE: Plugin/Block docs are disabled to prevent agents from creating custom TSX plugins.
 * Use MDX with stdlib components instead.
 *
 * To re-enable, restore the original content of this file.
 */

// Disabled - plugins are not currently supported
export const BLOCK_TYPES_SOURCE = "";

export const BLOCK_API_DOCS = `
## MDX Blocks

Reusable MDX fragments live in \`pages/blocks/\`. Embed them with:

\`\`\`mdx
<Page src="blocks/header" />
<Page src="blocks/user-card" params={{userId: 123}} />
\`\`\`

**Note:** Use MDX with stdlib components (LiveValue, charts, forms) for all visualizations.
`;

export const BLOCK_CONTEXT_DOCS = "";

export const BLOCK_ANTI_PATTERNS = "";
