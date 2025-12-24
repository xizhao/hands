/**
 * Action documentation for agents
 *
 * Actions are serverless compute functions that run on triggers.
 * They can read/write data, run on schedules, and respond to webhooks.
 */

/**
 * Action API documentation
 */
export const ACTION_API_DOCS = `
## Action Structure

Actions are serverless functions in the \`actions/\` directory. They can:
- Read/write data via \`ctx.sources\` or \`ctx.sql\`
- Run on schedules (cron)
- Respond to webhooks
- Be triggered manually
- Access secrets securely

### Basic Action

\`\`\`typescript
// actions/sync-data.ts
import { defineAction } from "@hands/core/primitives";

export default defineAction({
  name: "sync-data",
  description: "Sync data from external API",

  async run(input, ctx) {
    ctx.log.info("Starting sync");

    // Fetch external data
    const response = await fetch("https://api.example.com/data");
    const data = await response.json();

    // Write to database
    await ctx.sources.main.items.upsert(data.items, ["id"]);

    ctx.log.info("Sync complete", { count: data.items.length });
    return { synced: data.items.length };
  },
});
\`\`\`

### Scheduled Action

\`\`\`typescript
// actions/hourly-report.ts
import { defineAction } from "@hands/core/primitives";

export default defineAction({
  name: "hourly-report",
  description: "Generate hourly sales report",
  schedule: "0 * * * *", // Every hour

  async run(input, ctx) {
    const sales = await ctx.sql\`
      SELECT SUM(amount) as total
      FROM orders
      WHERE created_at > datetime('now', '-1 hour')
    \`;

    await ctx.notify.slack?.("#sales", \`Hourly sales: $\${sales[0].total}\`);
    return { total: sales[0].total };
  },
});
\`\`\`

### Action with Input Validation

\`\`\`typescript
// actions/process-order.ts
import { defineAction } from "@hands/core/primitives";
import { z } from "zod";

export default defineAction({
  name: "process-order",
  description: "Process a new order",
  triggers: ["manual", "webhook"],

  input: z.object({
    orderId: z.string(),
    priority: z.enum(["low", "normal", "high"]).default("normal"),
  }),

  async run(input, ctx) {
    ctx.log.info("Processing order", { orderId: input.orderId });

    const order = await ctx.sources.main.orders.selectOne({
      where: \`id = '\${input.orderId}'\`,
    });

    if (!order) {
      throw new Error(\`Order not found: \${input.orderId}\`);
    }

    // Process the order...
    await ctx.sources.main.orders.update(
      \`id = '\${input.orderId}'\`,
      { status: "processed", processed_at: new Date().toISOString() }
    );

    return { success: true, orderId: input.orderId };
  },
});
\`\`\`

### Action with Schema Requirements

\`\`\`typescript
// actions/sync-orders.ts
import { defineAction } from "@hands/core/primitives";

export default defineAction({
  name: "sync-orders",
  description: "Sync orders from Shopify",

  // Declare required database schema
  schema: {
    tables: [{
      name: "orders",
      columns: [
        { name: "id", type: "TEXT" },
        { name: "customer_email", type: "TEXT" },
        { name: "total", type: "REAL" },
        { name: "status", type: "TEXT" },
        { name: "created_at", type: "TIMESTAMP" },
      ],
      primaryKey: ["id"],
    }],
  },

  secrets: ["SHOPIFY_API_KEY"],

  async run(input, ctx) {
    const apiKey = ctx.secrets.SHOPIFY_API_KEY;
    // Sync logic...
  },
});
\`\`\`
`;

/**
 * Action context API documentation
 */
export const ACTION_CONTEXT_DOCS = `
## Action Context (ctx)

Every action receives a context object with these properties:

### ctx.sources
Access database tables by source name:
\`\`\`typescript
// Read
const users = await ctx.sources.main.users.select({ limit: 10 });
const user = await ctx.sources.main.users.selectOne({ where: "id = '123'" });
const count = await ctx.sources.main.users.count();

// Write
await ctx.sources.main.users.insert({ id: "1", name: "Alice" });
await ctx.sources.main.users.update("id = '1'", { name: "Bob" });
await ctx.sources.main.users.delete("id = '1'");
await ctx.sources.main.users.upsert(rows, ["id"]); // Insert or update
\`\`\`

### ctx.sql
Raw SQL queries with tagged template:
\`\`\`typescript
const results = await ctx.sql\`
  SELECT u.*, COUNT(o.id) as order_count
  FROM users u
  LEFT JOIN orders o ON o.user_id = u.id
  WHERE u.active = \${true}
  GROUP BY u.id
\`;
\`\`\`

### ctx.log
Structured logging:
\`\`\`typescript
ctx.log.debug("Debug message", { details });
ctx.log.info("Info message");
ctx.log.warn("Warning message");
ctx.log.error("Error message", { error });
\`\`\`

### ctx.secrets
Access secrets from .env.local:
\`\`\`typescript
const apiKey = ctx.secrets.API_KEY;
const dbUrl = ctx.secrets.DATABASE_URL;
\`\`\`

### ctx.notify
Send notifications:
\`\`\`typescript
await ctx.notify.slack?.("#channel", "Message");
await ctx.notify.email?.("user@example.com", "Subject", "Body");
await ctx.notify.webhook?.(url, payload);
\`\`\`

### ctx.run
Current run metadata:
\`\`\`typescript
ctx.run.id        // Unique run ID
ctx.run.trigger   // "manual" | "cron" | "webhook"
ctx.run.startedAt // Date object
ctx.run.input     // Input data
\`\`\`
`;

/**
 * Action triggers documentation
 */
export const ACTION_TRIGGERS_DOCS = `
## Triggers

Actions can be triggered in multiple ways:

### Manual
Always available. Triggered via UI or API.

### Schedule (Cron)
\`\`\`typescript
schedule: "0 * * * *"      // Every hour
schedule: "0 0 * * *"      // Daily at midnight
schedule: "*/15 * * * *"   // Every 15 minutes
schedule: "0 9 * * 1-5"    // 9am weekdays
\`\`\`

### Webhook
\`\`\`typescript
triggers: ["webhook"],
webhookPath: "/custom-path", // Optional, defaults to /webhook/:actionName
\`\`\`

Call via: \`POST http://localhost:PORT/webhook/action-name\`

### Secrets
Declare required secrets:
\`\`\`typescript
secrets: ["API_KEY"],
\`\`\`

Create \`.env.local\` in workbook root:
\`\`\`
API_KEY=your-api-key
\`\`\`
`;

/**
 * Common mistakes to avoid
 */
export const ACTION_ANTI_PATTERNS = `
## Common Mistakes

### WRONG: Using async at module level
\`\`\`typescript
// DON'T DO THIS
import { defineAction } from "@hands/core/primitives";

// ERROR: Can't use await at module level
const config = await loadConfig();

export default defineAction({
  name: "bad-action",
  async run(input, ctx) { ... },
});
\`\`\`

### CORRECT: Load config inside run function
\`\`\`typescript
import { defineAction } from "@hands/core/primitives";

export default defineAction({
  name: "good-action",
  async run(input, ctx) {
    const config = await loadConfig();
    // ...
  },
});
\`\`\`

### WRONG: Not handling errors
\`\`\`typescript
// DON'T DO THIS
async run(input, ctx) {
  const response = await fetch(url);
  const data = await response.json();
  // What if fetch fails?
}
\`\`\`

### CORRECT: Handle errors gracefully
\`\`\`typescript
async run(input, ctx) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(\`HTTP \${response.status}: \${response.statusText}\`);
    }
    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    ctx.log.error("Fetch failed", { error: error.message });
    throw error; // Re-throw to mark run as failed
  }
}
\`\`\`

### WRONG: Hardcoding secrets
\`\`\`typescript
// DON'T DO THIS
const API_KEY = "sk-1234567890";
\`\`\`

### CORRECT: Use ctx.secrets
\`\`\`typescript
async run(input, ctx) {
  const apiKey = ctx.secrets.API_KEY;
  if (!apiKey) throw new Error("API_KEY not configured");
}
\`\`\`
`;
