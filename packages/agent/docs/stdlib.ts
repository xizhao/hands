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
import { sql } from "@hands/db";

export const meta: BlockMeta = {
  title: "My Block",
  description: "What this block shows",
  refreshable: true,
};

// BlockFn receives props - db access is via import, not props
const MyBlock: BlockFn<{ limit?: number }> = async ({ limit = 10 }) => {
  // Use sql tagged template for queries
  const data = await sql<{ name: string; value: number }>\`
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

**IMPORTANT**: Database access is via \`import { sql } from '@hands/db'\`, not via props.

## Auto-Generated Types with pgtyped

Types are auto-generated from your SQL queries and available via \`@hands/db/types\`:

\`\`\`typescript
import { sql } from "@hands/db";
import type { IGetMoviesResult } from "@hands/db/types";

const MyBlock: BlockFn = async () => {
  // Result type is auto-generated from the SQL query
  const movies = await sql<IGetMoviesResult>\`
    SELECT id, title, rating FROM movies WHERE active = true
  \`;
  // movies is { id: number; title: string; rating: number }[]

  return <ul>{movies.map(m => <li key={m.id}>{m.title}</li>)}</ul>;
};
\`\`\`

Types are generated to \`.hands/types.ts\` when you save blocks containing SQL queries.
`;

/**
 * Database context API documentation
 */
export const BLOCK_CONTEXT_DOCS = `
## Database API

Import from @hands/db directly in your block:

\`\`\`typescript
import { sql } from "@hands/db";

const MyBlock: BlockFn = async () => {
  // sql is the tagged template for safe SQL queries
  const users = await sql<User>\`SELECT * FROM users WHERE active = \${true}\`;

  return <UserList users={users} />;
};
\`\`\`

### URL Parameters

Access URL/form parameters via the params helper:

\`\`\`typescript
import { sql, params } from "@hands/db";

const MyBlock: BlockFn = async () => {
  const { limit = 10 } = params<{ limit?: number }>();
  const items = await sql\`SELECT * FROM items LIMIT \${limit}\`;
  return <ItemList items={items} />;
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

### WRONG: Using ctx prop (deprecated)
\`\`\`typescript
// DON'T DO THIS - ctx prop is deprecated
const MyBlock: BlockFn = async ({ ctx }) => {
  const data = await ctx.sql\`...\`;
};
\`\`\`

### CORRECT: Import sql from @hands/db
\`\`\`typescript
// DO THIS - import sql directly
import { sql } from "@hands/db";

const MyBlock: BlockFn = async () => {
  const data = await sql\`SELECT ...\`;
};
\`\`\`

### WRONG: Using sql at module load time
\`\`\`typescript
// DON'T DO THIS - sql only works during request handling
import { sql } from "@hands/db";

// ERROR: Called at module load, not during request
const allUsers = await sql\`SELECT * FROM users\`;

const MyBlock: BlockFn = async () => {
  return <UserList users={allUsers} />;
};
\`\`\`

### CORRECT: Query inside the component function
\`\`\`typescript
import { sql } from "@hands/db";

const MyBlock: BlockFn = async () => {
  // Queries must be inside the component function
  const users = await sql\`SELECT * FROM users\`;
  return <UserList users={users} />;
};
\`\`\`
`;
