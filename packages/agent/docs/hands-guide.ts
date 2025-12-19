/**
 * Hands App Architecture Guide
 *
 * Balanced overview of all four primitives: Pages, Data, Blocks, Actions.
 * Keep this tight - it goes in system prompts.
 */

export const HANDS_ARCHITECTURE = `
## Hands Architecture

Four primitives: **Pages**, **Data (Tables + Sources)**, **Blocks**, **Actions**.

\`\`\`
workbook/
├── pages/        # MDX documents (user-facing)
├── blocks/       # TSX components (data visualizations)
├── sources/      # Data connectors (API sync)
├── actions/      # Scheduled/triggered tasks
└── ui/           # Client components (interactivity)
\`\`\`

### 1. Pages (MDX)

User-facing documents that compose content, data, and blocks.

\`\`\`mdx
---
title: Sales Dashboard
---

# Overview

We have <LiveValue query="SELECT COUNT(*) FROM customers" /> customers.

<Block src="revenue-chart" />

<LiveQuery query="SELECT name, total FROM top_customers LIMIT 5" />
\`\`\`

**Key components:**
- \`<LiveValue>\` - Inline SQL result (single value, shows as badge)
- \`<LiveQuery>\` - Block-level SQL result (auto-formatted table/list/metrics)
- \`<Block>\` - Embedded TSX component from blocks/

**When to use:** User-facing dashboards, reports, documentation with live data.

### 2. Data (Tables + Sources)

All data lives in PostgreSQL tables. Two ways to get data in:

**Sources** - Code-based API connectors (recurring sync):
\`\`\`
sources action='add' name='hackernews'  # Add connector
sources action='sync' name='hackernews' # Trigger sync
\`\`\`
Creates prefixed tables like \`hackernews_stories\`.

**@import** - One-time file ingestion:
\`\`\`
@import /path/to/data.csv
\`\`\`
User names the table.

**Querying:**
\`\`\`
sql query="SELECT * FROM customers LIMIT 10"
schema table="orders"  # View columns
\`\`\`

**When to use:** Sources for APIs, @import for files.

### 3. Blocks (TSX)

Server components that query data and render visualizations.

\`\`\`tsx
"use server";
import { sql } from "@hands/db";

export default async function RevenueChart({ period = "30d" }) {
  const data = await sql\`SELECT date, SUM(amount) as revenue FROM orders GROUP BY date\`;
  return <Chart data={data} />;
}
\`\`\`

**Rules:**
- MUST have \`"use server"\` directive
- Read-only (SELECT only, no INSERT/UPDATE)
- One concept per file
- No useState/useEffect (use ui/ components for interactivity)

**When to use:** Reusable charts, tables, metrics that appear in multiple pages.

### 4. Actions (Write Operations)

Scheduled or triggered tasks that write data.

\`\`\`
workbook/actions/
├── sync-stripe.ts      # Runs on schedule
├── daily-report.ts     # Cron job
└── webhook-handler.ts  # HTTP trigger
\`\`\`

**Triggers:**
- Schedule (cron)
- Webhook (HTTP)
- Manual (run button)

**When to use:** Data syncs, report generation, any write operations.

### Data Flow

\`\`\`
[External APIs] → Sources/Actions → [Tables] → Blocks/LiveQuery → [Pages]
                     write              store        read             display
\`\`\`

### Quick Decision Guide

| Want to... | Use |
|------------|-----|
| Show live data inline | \`<LiveValue query="...">\` in Page |
| Show query results | \`<LiveQuery query="...">\` in Page |
| Build reusable chart | Block in blocks/ |
| Connect an API | Source |
| Import a file | @import agent |
| Schedule data sync | Action |
| Add interactivity | ui/ component |

### UI Components (Client)

For interactivity, use client components in \`ui/\`:

\`\`\`tsx
"use client";
import { useState } from "react";

export function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(c => c + 1)}>{count}</button>;
}
\`\`\`

Import into blocks: \`import { Counter } from "@ui/counter"\`

Install shadcn components: \`ui add button card chart\`
`;
