/**
 * Block documentation for agents
 *
 * Uses Bun's text loader to import raw type definitions,
 * ensuring docs stay in sync with actual types.
 */

// @ts-expect-error - Bun text import
import blockTypesRaw from "../../runtime/src/types/block.js" with { type: "text" };

/**
 * Raw TypeScript source for block types
 * Auto-synced from @hands/runtime
 */
export const BLOCK_TYPES_SOURCE: string = blockTypesRaw;

/**
 * Plugin API documentation with correct signatures
 */
export const BLOCK_API_DOCS = `
## Plugin Structure

Plugins are custom TSX components for complex visualizations. They live in \`plugins/\`.

\`\`\`typescript
// plugins/my-chart.tsx
import { sql } from "@hands/db";
import type { BlockMeta } from "@hands/runtime";

export const meta: BlockMeta = {
  title: "My Chart",
  description: "What this plugin shows",
  refreshable: true,
};

interface Props {
  limit?: number;
}

export default async function MyChart({ limit = 10 }: Props) {
  const data = await sql<{ name: string; value: number }>\`
    SELECT name, value FROM my_table
    LIMIT \${limit}
  \`;

  return (
    <div className="p-4">
      <h2 className="text-lg font-bold mb-4">Title</h2>
      <ul>
        {data.map((row) => (
          <li key={row.name}>{row.name}: {row.value}</li>
        ))}
      </ul>
    </div>
  );
}
\`\`\`

**Imports:**
- Database: \`import { sql } from "@hands/db"\`
- Types: \`import type { BlockMeta } from "@hands/runtime"\`
- UI components from \`@ui\`: Card, Button, etc. (install with ui tool)

**Design Guidelines:**
- Make plugins feel like inline elements, not full pages
- Use a compact minimalist style

## Auto-Generated Types

Types are auto-generated from your SQL queries:

\`\`\`typescript
import { sql } from "@hands/db";

export default async function MovieList() {
  // Result type is inferred from the SQL query
  const movies = await sql<{ id: number; title: string; rating: number }>\`
    SELECT id, title, rating FROM movies WHERE active = true
  \`;

  return <ul>{movies.map(m => <li key={m.id}>{m.title}</li>)}</ul>;
}
\`\`\`
`;

/**
 * Database context API documentation
 */
export const BLOCK_CONTEXT_DOCS = `
## Database API

Import from @hands/db:

\`\`\`typescript
import { sql } from "@hands/db";

export default async function UserList() {
  // sql is the tagged template for safe SQL queries
  const users = await sql<User>\`SELECT * FROM users WHERE active = \${true}\`;

  return <ul>{users.map(u => <li key={u.id}>{u.name}</li>)}</ul>;
}
\`\`\`

### URL Parameters

Access URL/form parameters via the params helper:

\`\`\`typescript
import { sql, params } from "@hands/db";

export default async function ItemList() {
  const { limit = 10 } = params<{ limit?: number }>();
  const items = await sql\`SELECT * FROM items LIMIT \${limit}\`;
  return <ItemList items={items} />;
}
\`\`\`
`;

/**
 * Common mistakes to avoid
 */
export const BLOCK_ANTI_PATTERNS = `
## Common Mistakes

### WRONG: Using incorrect import paths
\`\`\`typescript
// DON'T DO THIS - @hands/core doesn't export sql
import { sql } from "@hands/core";
\`\`\`

### CORRECT: Use the proper module for each import
\`\`\`typescript
// DO THIS - sql comes from @hands/db, types from @hands/runtime
import { sql } from "@hands/db";
import type { BlockMeta, BlockFn } from "@hands/runtime";
\`\`\`

### WRONG: Using sql at module load time
\`\`\`typescript
// DON'T DO THIS - sql only works during request handling
import { sql } from "@hands/db";

// ERROR: Called at module load, not during request
const allUsers = await sql\`SELECT * FROM users\`;

export default function UserList() {
  return <ul>{allUsers.map(u => <li>{u.name}</li>)}</ul>;
}
\`\`\`

### CORRECT: Query inside the component function
\`\`\`typescript
import { sql } from "@hands/db";

export default async function UserList() {
  // Queries must be inside the component function
  const users = await sql\`SELECT * FROM users\`;
  return <ul>{users.map(u => <li key={u.id}>{u.name}</li>)}</ul>;
}
\`\`\`

`;
