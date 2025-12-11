/**
 * Stdlib documentation for agents
 *
 * Uses Bun's text loader to import raw type definitions,
 * ensuring docs stay in sync with actual types.
 */

// @ts-expect-error - Bun text import
import blockTypesRaw from "../../stdlib/src/types/block.ts" with { type: "text" };

/**
 * Raw TypeScript source for block types
 * Auto-synced from @hands/stdlib
 */
export const BLOCK_TYPES_SOURCE: string = blockTypesRaw;

/**
 * Block API documentation with correct signatures
 */
export const BLOCK_API_DOCS = `
## Block Structure

Every block follows this exact pattern:

\`\`\`typescript
import type { BlockFn, BlockMeta } from "@hands/stdlib";
import { LineChart } from "@hands/stdlib";

export const meta: BlockMeta = {
  title: "My Block",
  description: "What this block shows",
  refreshable: true,
};

// BlockFn receives a SINGLE props object containing ctx
const MyBlock: BlockFn<{ limit?: number }> = async ({ ctx, limit = 10 }) => {
  // Use ctx.db.sql tagged template for queries
  const data = await ctx.db.sql<{ name: string; value: number }[]>\`
    SELECT name, value FROM my_table
    LIMIT \${limit}
  \`;

  return (
    <div className="p-4">
      <h2 className="text-lg font-bold mb-4">Title</h2>
      <LineChart data={data} xKey="name" yKey="value" />
    </div>
  );
};

export default MyBlock;
\`\`\`

**Required exports:**
- \`meta: BlockMeta\` - Title, description, refreshable flag
- \`default\` - The BlockFn component

**IMPORTANT**: BlockFn receives ONE argument (props object with \`ctx\` inside), NOT two arguments.
`;

/**
 * BlockContext API documentation
 */
export const BLOCK_CONTEXT_DOCS = `
## BlockContext API

The \`ctx\` is destructured from props:

\`\`\`typescript
const MyBlock: BlockFn = async ({ ctx }) => {
  // ctx.db.sql is the tagged template for safe SQL queries
  const users = await ctx.db.sql<User[]>\`SELECT * FROM users WHERE active = \${true}\`;

  // ctx.params contains URL/form parameters
  const limit = ctx.params.limit || 10;
};
\`\`\`

### Type Definitions (from @hands/stdlib)

\`\`\`typescript
${blockTypesRaw}
\`\`\`
`;

/**
 * Common mistakes to avoid
 */
export const BLOCK_ANTI_PATTERNS = `
## Common Mistakes

### WRONG: Two-argument signature
\`\`\`typescript
// DON'T DO THIS - ctx will be undefined
const MyBlock: BlockFn = async (props, ctx) => {
  const data = await ctx.db.sql\`...\`; // ERROR: ctx is undefined
};
\`\`\`

### CORRECT: Destructure from props
\`\`\`typescript
// DO THIS - ctx is part of props
const MyBlock: BlockFn = async ({ ctx }) => {
  const data = await ctx.db.sql\`...\`;
};
\`\`\`

### WRONG: Using db directly as template
\`\`\`typescript
// DON'T DO THIS
const data = await ctx.db\`SELECT ...\`;
\`\`\`

### CORRECT: Use db.sql
\`\`\`typescript
// DO THIS
const data = await ctx.db.sql\`SELECT ...\`;
\`\`\`
`;
