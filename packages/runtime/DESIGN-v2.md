# Hands Runtime v2 - Design Document

## Overview

This document describes the v2 architecture for the Hands runtime, introducing a cleaner separation of concerns between data storage, data transformation, and data presentation.

## Core Concepts

### The Three Layers

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              HANDS RUNTIME                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                 │
│  │   BLOCKS    │    │   SOURCES   │    │   ACTIONS   │                 │
│  │  (View)     │    │  (Data)     │    │  (Compute)  │                 │
│  │             │    │             │    │             │                 │
│  │  ■ Query    │    │  ● Tables   │    │  ▶ ETL      │                 │
│  │  ■ Display  │    │  ● CRUD API │    │  ▶ Jobs     │                 │
│  │  ■ Interact │    │  ● Perms    │    │  ▶ Notify   │                 │
│  └─────────────┘    └─────────────┘    └─────────────┘                 │
│         │                  │                  │                         │
│         │    READ          │    READ/WRITE    │                         │
│         └──────────────────┼──────────────────┘                         │
│                            │                                            │
│                    ┌───────▼───────┐                                    │
│                    │   PostgreSQL  │                                    │
│                    │   (PGlite)    │                                    │
│                    └───────────────┘                                    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 1. Blocks (View Layer)

**Purpose**: Query, display, and interact with data.

**Key Principles**:

- **Read-only on persistent tables** - Blocks can SELECT but never INSERT/UPDATE/DELETE
- **Temp tables allowed** - Complex queries can use temporary tables for staging
- **Pure render** - No side effects on mount/render
- **Interactive** - Can have UI that triggers Actions

### Characteristics

| Property      | Description                                       |
| ------------- | ------------------------------------------------- |
| Data Access   | Read-only SQL queries via `sql` tagged template   |
| Temp Tables   | Can CREATE TEMP TABLE for complex transformations |
| Rendering     | React Server Components (RSC)                     |
| Interactivity | Client components for filters, forms, buttons     |
| Side Effects  | None on render; user actions trigger Actions      |

### File Structure

```
workbook/
  blocks/
    dashboard.tsx      # Main dashboard view
    sales-report.tsx   # Sales analytics
    ui/
      customer-list.tsx
      order-form.tsx   # Form that calls an Action on submit
```

### Example

```tsx
// blocks/dashboard.tsx
import { sql } from "hands:db";
import { Card, DataTable, BarChart } from "hands:ui";

export default async function Dashboard() {
  // Read-only query - no side effects
  const revenue = await sql`
    SELECT date, SUM(amount) as total
    FROM orders
    GROUP BY date
    ORDER BY date DESC
    LIMIT 30
  `;

  return (
    <div>
      <Card title="Revenue (30 days)">
        <BarChart data={revenue} x="date" y="total" />
      </Card>
    </div>
  );
}
```

### What Blocks Should NOT Do

```tsx
// ❌ BAD - Side effects on render
export default async function Dashboard() {
  await sql`INSERT INTO page_views (page) VALUES ('dashboard')`; // NO!
  await fetchExternalAPI(); // NO - use an Action
  await sendEmail(); // NO - use an Action
}

// ✅ GOOD - Pure read, user action triggers Action
export default async function Dashboard() {
  const data = await sql`SELECT * FROM metrics`;

  return (
    <div>
      <DataTable data={data} />
      <RefreshButton action="/actions/sync-metrics/run" /> {/* Explicit user action */}
    </div>
  );
}
```

### Database-Level Enforcement

Block read-only access is enforced at the PostgreSQL level using roles, not just application code.

#### Role Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     PGlite Instance                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ROLE: postgres (superuser)                                 │
│  └─ Used by: Actions, Source CRUD APIs                      │
│  └─ Can: INSERT, UPDATE, DELETE, CREATE, DROP, etc.         │
│                                                             │
│  ROLE: hands_reader (NOLOGIN)                               │
│  └─ Used by: Block rendering (RSC)                          │
│  └─ Can: SELECT, CREATE TEMP TABLE                          │
│  └─ Cannot: INSERT, UPDATE, DELETE on persistent tables     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### Role Setup (on runtime boot)

```sql
-- Create read-only role for blocks
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'hands_reader') THEN
    CREATE ROLE hands_reader WITH NOLOGIN;
  END IF;
END $$;

-- Grant SELECT on all existing tables
GRANT SELECT ON ALL TABLES IN SCHEMA public TO hands_reader;

-- Grant SELECT on future tables automatically
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO hands_reader;

-- Allow temp tables for complex queries
GRANT TEMPORARY ON DATABASE template1 TO hands_reader;
```

#### Permission Matrix

| Operation         | hands_reader (Blocks) | postgres (Actions/API) |
| ----------------- | --------------------- | ---------------------- |
| SELECT            | ✓                     | ✓                      |
| INSERT            | ✗ blocked             | ✓                      |
| UPDATE            | ✗ blocked             | ✓                      |
| DELETE            | ✗ blocked             | ✓                      |
| CREATE TABLE      | ✗ blocked             | ✓                      |
| DROP TABLE        | ✗ blocked             | ✓                      |
| TRUNCATE          | ✗ blocked             | ✓                      |
| CREATE TEMP TABLE | ✓                     | ✓                      |
| INSERT into TEMP  | ✓                     | ✓                      |
| REFRESH MATVIEW   | ✗ blocked             | ✓                      |

#### Runtime Implementation

```typescript
// When rendering a Block, switch to read-only role
async function renderBlock(blockId: string, db: PGlite) {
  // Switch to read-only role
  await db.exec(`SET ROLE hands_reader`);

  try {
    // Execute block's queries - can only SELECT + temp tables
    const result = await executeBlockCode(blockId, db);
    return result;
  } finally {
    // Always reset to superuser
    await db.exec(`RESET ROLE`);
  }
}

// Actions and Source API use default postgres role (full access)
async function runAction(actionId: string, db: PGlite) {
  // No SET ROLE - uses postgres superuser
  const result = await executeActionCode(actionId, db);
  return result;
}
```

#### Why Database-Level Enforcement?

1. **Defense in depth** - Even if application code has a bug, Postgres blocks writes
2. **Cannot be bypassed** - No way for Block code to escalate privileges
3. **Transparent** - Standard Postgres permissions, well-understood
4. **Auditable** - Failed writes show up in logs with clear error messages

#### Temp Table Use Cases

Blocks can use temp tables for complex transformations:

```tsx
// blocks/complex-report.tsx
export default async function ComplexReport() {
  // Create temp table for intermediate results
  await sql`
    CREATE TEMP TABLE IF NOT EXISTS staged_data AS
    SELECT
      customer_id,
      SUM(amount) as total,
      COUNT(*) as order_count
    FROM orders
    WHERE created_at > NOW() - INTERVAL '30 days'
    GROUP BY customer_id
  `;

  // Join with other data
  const report = await sql`
    SELECT
      c.name,
      c.email,
      s.total,
      s.order_count
    FROM staged_data s
    JOIN customers c ON c.id = s.customer_id
    WHERE s.total > 1000
    ORDER BY s.total DESC
  `;

  // Temp table auto-cleaned when session ends
  return <DataTable data={report} />;
}
```

Temp tables are:

- Session-scoped (auto-cleanup)
- Not visible to other connections
- Cannot affect persistent data
- Useful for multi-step transformations, recursive queries, performance optimization

---

## 2. Sources (Data Layer)

**Purpose**: Logical grouping of tables with automatic CRUD APIs.

**Key Principles**:

- **Table ownership** - Every table belongs to a Source
- **Auto-generated API** - CRUD routes from schema introspection
- **Permissions** - Row-level and column-level access control
- **Schema-driven** - Tables define their own structure

### Characteristics

| Property    | Description                   |
| ----------- | ----------------------------- |
| Structure   | Folder of related tables      |
| API         | Auto-generated REST endpoints |
| Permissions | Declarative access control    |
| Discovery   | Runtime introspects DB schema |

### File Structure

```
workbook/
  sources/
    crm/
      _source.ts       # Source config (permissions, etc.)
      contacts.sql     # Table schema
      deals.sql
      activities.sql
    analytics/
      _source.ts
      events.sql
      metrics.sql
```

### Source Configuration

```typescript
// sources/crm/_source.ts
import { defineSource } from "hands:runtime";

export default defineSource({
  name: "crm",
  description: "Customer relationship management data",

  // Default permissions for all tables in this source
  permissions: {
    read: true, // Anyone can read
    write: "authenticated", // Only authenticated users can write
    delete: "admin", // Only admins can delete
  },

  // Table-specific overrides
  tables: {
    contacts: {
      // Row-level security
      rowFilter: (user) => sql`owner_id = ${user.id} OR ${user.isAdmin}`,

      // Column-level security
      hiddenColumns: ["ssn", "internal_notes"],
    },
    deals: {
      write: "sales-team", // Only sales team can modify deals
    },
  },
});
```

### Table Schema

```sql
-- sources/crm/contacts.sql
CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  company TEXT,
  owner_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS contacts_owner_idx ON contacts(owner_id);
CREATE INDEX IF NOT EXISTS contacts_email_idx ON contacts(email);
```

### Auto-Generated API

For a source `crm` with table `contacts`:

| Method | Endpoint                    | Description                      |
| ------ | --------------------------- | -------------------------------- |
| GET    | `/sources/crm/contacts`     | List all (paginated, filterable) |
| GET    | `/sources/crm/contacts/:id` | Get one by ID                    |
| POST   | `/sources/crm/contacts`     | Create new record                |
| PUT    | `/sources/crm/contacts/:id` | Update record                    |
| PATCH  | `/sources/crm/contacts/:id` | Partial update                   |
| DELETE | `/sources/crm/contacts/:id` | Delete record                    |

Query parameters for list endpoint:

- `?limit=50&offset=0` - Pagination
- `?sort=created_at:desc` - Sorting
- `?filter[email]=john@example.com` - Filtering
- `?select=id,name,email` - Field selection

### Orphan Tables

Tables not captured in a named source go to `_default`:

```
/sources/_default/legacy_table
/sources/_default/temp_import_123
```

The runtime auto-discovers these via schema introspection.

---

## 3. Actions (Compute Layer)

**Purpose**: Perform work - ETL, notifications, integrations, any side effects.

**Key Principles**:

- **Explicit triggers** - Never runs on render; requires schedule, webhook, or user action
- **Typed I/O** - Zod schemas for inputs, typed outputs
- **Secrets management** - Declare required secrets, injected at runtime
- **Auditable** - Run history, logs, status tracking

### Characteristics

| Property     | Description                                  |
| ------------ | -------------------------------------------- |
| Triggers     | Cron schedule, webhook, manual, Block button |
| I/O          | Zod-validated input, typed context           |
| Secrets      | Declarative, injected from secure store      |
| Cross-source | Can read/write any Source                    |
| Side effects | Send emails, call APIs, write files          |

### File Structure

```
workbook/
  actions/
    sync-hackernews.ts    # Scheduled ETL job
    send-report.ts        # Manual trigger, sends email
    webhook-stripe.ts     # Webhook handler
    cleanup-old-data.ts   # Maintenance job
```

### Action Definition

```typescript
// actions/sync-hackernews.ts
import { defineAction } from "hands:runtime";
import { z } from "zod";

export default defineAction({
  name: "sync-hackernews",
  description: "Fetch top stories from Hacker News API",

  // When to run
  schedule: "0 * * * *", // Every hour (cron syntax)

  // Can also be triggered manually or via webhook
  triggers: ["manual", "webhook"],

  // Required secrets (fetched from secure store)
  secrets: [], // HN API is public, but could be ["HN_API_KEY"]

  // Input schema (for manual runs or webhook payload)
  input: z.object({
    limit: z.number().min(1).max(500).default(100),
    type: z.enum(["top", "new", "best"]).default("top"),
  }),

  // The actual work
  async run(input, ctx) {
    const { limit, type } = input;

    // Fetch from external API
    const storyIds = await fetch(
      `https://hacker-news.firebaseio.com/v0/${type}stories.json`
    ).then((r) => r.json());

    const stories = await Promise.all(
      storyIds
        .slice(0, limit)
        .map((id) =>
          fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`).then(
            (r) => r.json()
          )
        )
    );

    // Write to source (upsert)
    const inserted = await ctx.sources.hackernews.stories.upsert(
      stories.map((s) => ({
        id: s.id,
        title: s.title,
        url: s.url,
        score: s.score,
        by: s.by,
        time: new Date(s.time * 1000),
      })),
      { onConflict: "id" }
    );

    // Log progress
    ctx.log.info(`Synced ${inserted.length} stories`);

    // Optional: notify
    if (inserted.length > 0) {
      await ctx.notify.slack(
        "#data-updates",
        `Synced ${inserted.length} HN stories`
      );
    }

    // Return summary (stored in run history)
    return {
      synced: inserted.length,
      type,
    };
  },
});
```

### Action Context

The `ctx` object provides:

```typescript
interface ActionContext {
  // Access to all sources
  sources: {
    [sourceName: string]: {
      [tableName: string]: TableClient;
    };
  };

  // Raw SQL access
  sql: SqlTaggedTemplate;

  // Logging (stored with run)
  log: {
    debug(msg: string, data?: object): void;
    info(msg: string, data?: object): void;
    warn(msg: string, data?: object): void;
    error(msg: string, data?: object): void;
  };

  // Notifications
  notify: {
    slack(channel: string, message: string): Promise<void>;
    email(to: string, subject: string, body: string): Promise<void>;
    webhook(url: string, payload: object): Promise<void>;
  };

  // Secrets (already resolved)
  secrets: Record<string, string>;

  // Run metadata
  run: {
    id: string;
    trigger: "schedule" | "manual" | "webhook";
    startedAt: Date;
    input: object;
  };
}
```

### Action API

| Method | Endpoint                  | Description                         |
| ------ | ------------------------- | ----------------------------------- |
| POST   | `/actions/:name/run`      | Trigger a run (with optional input) |
| GET    | `/actions/:name/runs`     | List run history                    |
| GET    | `/actions/:name/runs/:id` | Get run details + logs              |
| DELETE | `/actions/:name/runs/:id` | Cancel a running action             |
| GET    | `/actions/:name`          | Get action metadata                 |

### Webhook Actions

```typescript
// actions/webhook-stripe.ts
import { defineAction } from "hands:runtime";
import { z } from "zod";

export default defineAction({
  name: "webhook-stripe",
  description: "Handle Stripe webhook events",

  triggers: ["webhook"],

  secrets: ["STRIPE_WEBHOOK_SECRET"],

  // Stripe sends the event type in the payload
  input: z.object({
    type: z.string(),
    data: z.object({
      object: z.record(z.unknown()),
    }),
  }),

  async run(input, ctx) {
    const { type, data } = input;

    switch (type) {
      case "payment_intent.succeeded":
        await ctx.sources.payments.transactions.insert({
          stripe_id: data.object.id,
          amount: data.object.amount,
          status: "completed",
        });
        break;

      case "customer.subscription.deleted":
        await ctx.sources.subscriptions.active.update(
          { stripe_customer_id: data.object.customer },
          { status: "cancelled", cancelled_at: new Date() }
        );
        break;
    }

    return { handled: type };
  },
});
```

---

## Data Flow

### Read Path (Blocks)

```
User navigates to /blocks/dashboard
         │
         ▼
    Block renders (RSC)
         │
         ▼
    sql`SELECT ...` ──────► PostgreSQL
         │                      │
         ▼                      │
    Return HTML ◄───────────────┘
```

### Write Path (Actions)

```
Cron fires / User clicks "Sync" / Webhook received
         │
         ▼
    Action triggered
         │
         ▼
    Validate input (Zod)
         │
         ▼
    Fetch secrets
         │
         ▼
    Execute run() ──────► External APIs
         │                      │
         ▼                      ▼
    ctx.sources.*.insert() ──► PostgreSQL
         │
         ▼
    Store run result + logs
         │
         ▼
    Return summary
```

### CRUD Path (Sources API)

```
POST /sources/crm/contacts { name: "John", email: "john@..." }
         │
         ▼
    Check permissions
         │
         ▼
    Validate against schema
         │
         ▼
    INSERT INTO crm.contacts ──► PostgreSQL
         │
         ▼
    Return created record
```

---

## UI Representation

### Sidebar

```
┌─────────────────────┐
│ ■ Blocks            │  (blue)
│   ├─ dashboard      │
│   ├─ sales-report   │
│   └─ ui/            │
│       ├─ customers  │
│       └─ orders     │
│                     │
│ ● Sources           │  (purple)
│   ├─ crm/           │
│   │   ├─ contacts   │
│   │   ├─ deals      │
│   │   └─ activities │
│   └─ analytics/     │
│       ├─ events     │
│       └─ metrics    │
│                     │
│ ▶ Actions           │  (green)
│   ├─ sync-hn        │
│   ├─ send-report    │
│   └─ cleanup        │
└─────────────────────┘
```

### Actions Panel

When viewing an Action, show:

- Description
- Schedule (if any)
- Input schema (form)
- "Run Now" button
- Run history with logs

---

## Migration from v1

### Terminology Changes

| v1                | v2           | Notes               |
| ----------------- | ------------ | ------------------- |
| Source (sync job) | Action       | Clearer it's a task |
| Table (orphan)    | Source.table | Tables have a home  |
| Block             | Block        | Unchanged           |

### File Structure Changes

```
# v1
workbook/
  sources/
    hackernews/
      index.ts      # Sync logic + table definition
  blocks/
    dashboard.tsx

# v2
workbook/
  sources/
    hackernews/
      _source.ts    # Source config
      stories.sql   # Table schema only
  actions/
    sync-hackernews.ts  # Sync logic moved here
  blocks/
    dashboard.tsx
```

### API Changes

```
# v1
POST /sources/hackernews/sync     # Run sync job
GET  /postgres/schema             # Get all tables

# v2
POST /actions/sync-hackernews/run # Run action
GET  /sources                     # List all sources
GET  /sources/hackernews/stories  # CRUD for table
```

---

## Implementation Phases

### Phase 1: Actions

- [ ] Rename `sources/` to `actions/` in stdlib registry
- [ ] Update runtime to look for `actions/` directory
- [ ] Implement Action definition format
- [ ] Add `/actions/:name/run` endpoint
- [ ] Add run history storage

### Phase 2: Sources

- [ ] Add Source concept (table groupings)
- [ ] Schema introspection for auto-discovery
- [ ] Auto-generate CRUD routes
- [ ] Implement permissions layer
- [ ] Handle orphan tables

### Phase 3: UI

- [ ] Update sidebar to show three sections
- [ ] Add Actions panel with run history
- [ ] Add Source/table browser
- [ ] Update Block editor (read-only indicators)

### Phase 4: Polish

- [ ] Migration tooling for v1 → v2
- [ ] Documentation
- [ ] CLI updates
- [ ] Agent prompt updates

---

## Open Questions

1. **Source namespacing**: Should tables be `crm_contacts` or `crm.contacts` (schemas)?
2. **Permissions storage**: Where do permission configs live? File vs DB?
3. **Action concurrency**: Allow parallel runs of same action?
4. **Source versioning**: Schema migrations for Source tables?
5. **Cross-workbook**: Can Actions access other workbooks' Sources?
