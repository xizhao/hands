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
└── hands.json    # Config
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

### Blocks (TSX) - READ ONLY
Single-file components: query + view together. One concept = one file.

\`\`\`tsx
import { BarChart } from "@hands/stdlib";
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
      <BarChart data={data} xKey="day" yKey="revenue" />
    </div>
  );
}
\`\`\`

**Block rules:**
- Read-only (no INSERT/UPDATE/DELETE - use Actions for writes)
- One file per concept
- Use \`@hands/stdlib\` for charts, tables, interactive UI

### Tables (PostgreSQL)
Data lives in PostgreSQL. Query with \`sql\` tagged template:
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

### stdlib Components

Use \`components\` tool to see available:
- **Charts**: LineChart, BarChart, AreaChart, PieChart
- **Data**: DataTable, MetricCard
- **UI**: Card, Badge, Button

### Quick Reference

| Want to... | Use |
|------------|-----|
| Show data to users | Page with Blocks |
| Query + visualize | Block with sql + stdlib |
| Write/sync data | Action |
`;

