/**
 * Hands App Architecture Guide
 *
 * Concise reference for agents building Hands workbooks.
 * Keep this tight - it goes in system prompts.
 */

export const HANDS_ARCHITECTURE = `
## Hands App Architecture

Four primitives: **Pages**, **Blocks**, **Tables**, **Actions**.

\`\`\`
workbook/
├── pages/        # MDX documents (what users see)
├── blocks/       # TSX components (query + view)
├── sources/      # Table definitions + sync logic
└── package.json  # Config (hands field)
\`\`\`

### Pages (MDX)
User-facing documents that compose blocks.

\`\`\`mdx
---
title: Sales Dashboard
---

# Sales Overview

<Block src="revenue-chart" period="30d" />

Top customers:

<Block src="top-customers" limit={10} />
\`\`\`

### Blocks (TSX) - Server Components
Single-file components: query + view together. One concept = one file. 

\`\`\`tsx
"use server";

import { sql } from "@hands/db";

export default async function RevenueChart({ period = "30d" }) {
  const data = await sql\`
    SELECT date_trunc('day', created_at) as day, SUM(amount) as revenue
    FROM orders
    WHERE created_at > NOW() - INTERVAL '\${period}'
    GROUP BY 1 ORDER BY 1
  \`;

  return (
    <div className="p-4">
      <h3 className="font-semibold mb-2">Revenue</h3>
      <ul>
        {data.map((row) => (
          <li key={row.day}>{row.day}: {row.revenue}</li>
        ))}
      </ul>
    </div>
  );
}
\`\`\`

**Block rules:**
- MUST have \`"use server"\` directive at the top
- Read-only (no INSERT/UPDATE/DELETE - use Actions for writes)
- One file per concept
- CANNOT use useState, useEffect, onClick, etc. (client patterns)
- All client interactivity should be factored into a separate client component in ui/ imported into the Block
- Use the ui tool to install interactive components to @ui
- Style with Tailwind CSS

### UI Components (Client)
Interactive components live in \`ui/\` with \`"use client"\` directive.

\`\`\`tsx
"use client";

import { useState } from "react";

export function Counter({ initial = 0 }) {
  const [count, setCount] = useState(initial);
  return <button onClick={() => setCount(c => c + 1)}>{count}</button>;
}
\`\`\`

**UI rules:**
- MUST have \`"use client"\` directive at the top
- CAN use hooks (useState, useEffect, etc.) and event handlers
- CANNOT use \`sql\` or async data fetching
- Receive data as props from server blocks

### Server + Client Pattern
When blocks need interactivity, import client components from \`@ui\`:

\`\`\`tsx
// blocks/users.tsx
"use server";

import { sql } from "@hands/db";
import { UserTable } from "@ui/user-table";

export default async function Users() {
  const users = await sql\`SELECT * FROM users\`;
  return <UserTable users={users} />;  // Pass data to client component
}
\`\`\`

### Tables (SQLite)
Data lives in SQLite. Query with \`sql\` tagged template:
\`\`\`tsx
import { sql } from "@hands/db";
const users = await sql<User>\`SELECT * FROM users WHERE active = \${true}\`;
\`\`\`

### Actions (Write Operations)
Actions write data. Triggered by schedule, webhook, or manual.
\`\`\`
workbook/actions/
  sync-stripe.ts      # Scheduled API sync
  process-upload.ts   # Webhook handler
\`\`\`

### Data Flow

\`\`\`
[External APIs] → Actions → [Tables] → Blocks → [Pages]
                   write              read-only
\`\`\`

### shadcn Components

Use the \`ui\` tool to install shadcn components to \`ui/\`:
- Search: \`ui search "chart"\` to find components
- Install: \`ui add button card\` to install
- Import: \`import { Button } from "@ui/button"\`

### Quick Reference

| Want to... | Use |
|------------|-----|
| Show data to users | Page with Blocks |
| Query + visualize | Block with \`"use server"\` + sql |
| Write/sync data | Action |
| Interactive UI | \`ui/\` components with \`"use client"\` |
`;
