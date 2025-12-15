# Hands Runtime

The Hands Runtime is a single-process Node.js server that provides the backend infrastructure for workbooks. It manages an embedded PostgreSQL database, serves React Server Components, and orchestrates the three core primitives: **Blocks**, **Sources**, and **Actions**.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Hono HTTP Server                        │
├─────────────────────────────────────────────────────────────────┤
│  /health, /ready    │  /manifest    │  /trpc/*    │  /sandbox/* │
│  Infrastructure     │  Discovery    │  Type-safe  │  RSC Proxy  │
│                     │  Metadata     │  RPC API    │  (Vite)     │
├─────────────────────┴───────────────┴─────────────┴─────────────┤
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │    Blocks    │  │   Sources    │  │   Actions    │          │
│  │  (React UI)  │  │   (Data)     │  │  (Compute)   │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                    PGlite (Embedded PostgreSQL)                 │
│              Role-based access: reader / writer / admin         │
└─────────────────────────────────────────────────────────────────┘
```

## Progressive Readiness

The runtime uses a **Progressive Readiness** architecture:

1. **HTTP server starts immediately** on the configured port
2. **Services boot asynchronously** in the background:
   - PGlite database initialization
   - Vite dev server for RSC
   - Editor dev server (spawned on demand)
   - Action scheduler
3. **Endpoints respond based on readiness**:
   - `/health` → always returns `{ status: "ok" }`
   - `/ready` → returns 503 until all services are ready
   - `/manifest` → returns partial data as services come online

This allows the desktop app to connect immediately and show loading states while the runtime boots.

## The Three Primitives

### 1. Blocks (UI Components)

Blocks are React Server Components that render data visualizations and interactive interfaces.

**Location**: `workbook/blocks/*.tsx`

**Discovery Pattern**:
- Single `.tsx` files in the blocks directory
- Can be nested in subdirectories for grouping
- Must export a default React component
- ID is derived from file path (e.g., `charts/bar-chart.tsx` → `charts/bar-chart`)

**Example Structure**:
```
workbook/blocks/
  sales-chart.tsx     # Block ID: "sales-chart"
  customer-table.tsx  # Block ID: "customer-table"
  charts/
    bar-chart.tsx     # Block ID: "charts/bar-chart"
    line-chart.tsx    # Block ID: "charts/line-chart"
```

**Example Block**:
```tsx
// workbook/blocks/sales-chart.tsx
import type { BlockFn } from "@hands/stdlib";
import { db } from "@hands/runtime/context";

const SalesChart: BlockFn<{ limit?: number }> = async ({ limit = 100 }) => {
  // Use db.sql tagged template for type-safe queries
  const sales = await db.sql`SELECT * FROM sales ORDER BY date DESC LIMIT ${limit}`;

  return (
    <div>
      <h2>Sales Overview</h2>
      <ul>
        {sales.map((sale: any) => (
          <li key={sale.id}>{sale.date}: ${sale.amount}</li>
        ))}
      </ul>
    </div>
  );
};

export default SalesChart;
```

**Database Access**:
- `import { db } from "@hands/runtime/context"` - Import the database context
- `db.sql` - Tagged template literal for parameterized SQL queries
- `db.query` - Execute PgTyped prepared queries with type-safe params
- `params()` - Get URL/form parameters (also from `@hands/runtime/context`)
- Blocks use read-only database access (`hands_reader` role)

**How it works**:
1. Runtime discovers blocks via `blocks/discovery.ts`
2. Generates `worker.tsx` with block imports
3. Vite builds the RSC bundle
4. Requests to `/sandbox/*` are proxied to Vite dev server
5. Runtime sets up request context via AsyncLocalStorage before rendering
6. Blocks import `db` from `@hands/runtime/context` which reads from the request context

### 2. Sources (Data Containers)

Sources define the data schema and provide typed access to database tables.

**Location**: `workbook/sources/*/source.ts`

**Discovery Pattern**:
- Each source has its own directory
- Must export a `SourceDefinition` with table configurations
- Tables are created/migrated automatically on startup

**Example Structure**:
```
workbook/sources/
  analytics/
    source.ts       # Source definition with tables
  inventory/
    source.ts
```

**Example Source**:
```typescript
// workbook/sources/analytics/source.ts
import { defineSource, defineTable } from "@hands/stdlib";

export default defineSource({
  name: "analytics",
  description: "Website analytics data",
  tables: {
    pageviews: defineTable({
      columns: {
        id: { type: "serial", primaryKey: true },
        url: { type: "text", nullable: false },
        visitor_id: { type: "text" },
        timestamp: { type: "timestamptz", default: "now()" },
      },
    }),
    events: defineTable({
      columns: {
        id: { type: "serial", primaryKey: true },
        name: { type: "text", nullable: false },
        properties: { type: "jsonb" },
      },
    }),
  },
});
```

**How it works**:
1. Runtime discovers sources via `sources/discovery.ts`
2. Creates PostgreSQL schemas for each source
3. Generates DDL and runs migrations
4. Exposes tRPC endpoints for CRUD operations
5. Provides typed `TableClient` in action contexts

### 3. Actions (Compute Functions)

Actions are serverless functions that can be triggered manually, on a schedule, or via webhooks.

**Location**: `workbook/actions/*.ts` or `workbook/actions/*/action.ts`

**Discovery Pattern**:
- Single-file actions: `actions/my-action.ts`
- Directory actions: `actions/my-action/action.ts`
- Must export a default `ActionDefinition`

**Example Structure**:
```
workbook/actions/
  sync-api.ts           # Single-file action
  daily-report/
    action.ts           # Directory action
    helpers.ts          # Supporting files
```

**Example Action**:
```typescript
// workbook/actions/sync-api.ts
import { defineAction } from "@hands/stdlib";

export default defineAction({
  name: "Sync API Data",
  description: "Fetches data from external API and upserts to database",
  schedule: "0 */6 * * *",  // Every 6 hours
  triggers: ["manual", "webhook"],
  secrets: ["API_KEY"],

  async run(input, ctx) {
    ctx.log.info("Starting API sync");

    // Access secrets
    const apiKey = ctx.secrets.API_KEY;

    // Fetch external data
    const response = await fetch("https://api.example.com/data", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const data = await response.json();

    // Write to database via sources
    await ctx.sources.analytics.events.insert(
      data.map(item => ({
        name: item.event,
        properties: item.metadata,
      }))
    );

    ctx.log.info("Sync complete", { count: data.length });
    return { synced: data.length };
  },
});
```

**Trigger Types**:
- `manual` - Run via UI or tRPC API
- `webhook` - HTTP POST to `/webhook/:actionId`
- `cron` - Scheduled via `schedule` property (cron expression)
- `pg_notify` - PostgreSQL LISTEN/NOTIFY (planned)

**Action Context (`ctx`)**:
- `ctx.sources` - Typed access to all source tables
- `ctx.sql` - Raw SQL template literal
- `ctx.log` - Structured logging (debug, info, warn, error)
- `ctx.secrets` - Resolved secrets from `.env.local`
- `ctx.run` - Run metadata (id, trigger, startedAt)

## Database Management

### PGlite

The runtime uses [PGlite](https://pglite.dev/) - an embedded PostgreSQL that runs in-process via WASM.

**Persistence**: Database is saved to `workbook/db.tar.gz` on shutdown and restored on startup.

**Extensions**:
- `uuid-ossp` - UUID generation
- `pgvector` - Vector similarity search (planned)

### Role-Based Access

Three PostgreSQL roles control access:

| Role | Permissions | Used By |
|------|-------------|---------|
| `hands_reader` | SELECT only | Read-only queries |
| `hands_writer` | SELECT, INSERT, UPDATE, DELETE | Actions, Sources |
| `postgres` | Full admin | Schema migrations |

### Schema Organization

```
public/                    # User source tables
  analytics_pageviews
  analytics_events
  inventory_products

hands_admin/               # Runtime internals
  action_runs              # Action execution history
```

## HTTP API Endpoints

### Infrastructure

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Always returns `{ status: "ok" }` |
| `/ready` | GET | Returns 200 when fully ready, 503 otherwise |
| `/manifest` | GET | Returns discovered blocks, sources, actions |

### tRPC API (`/trpc/*`)

Type-safe RPC endpoints for the desktop app:

**Sources**:
- `sources.list` - List all discovered sources
- `sources.get` - Get source by ID with table metadata
- `sources.query` - Execute SQL query against source

**Actions**:
- `actions.list` - List all discovered actions
- `actions.get` - Get action by ID
- `actions.run` - Execute action manually
- `actions.runs` - Query action run history
- `actions.stats` - Get action statistics

**Database**:
- `db.query` - Execute raw SQL (admin only)
- `db.tables` - List all tables
- `db.schema` - Get table schema

### Webhooks

```
POST /webhook/:actionId
POST /webhook/:actionId/:customPath
```

Triggers actions with `webhook` in their `triggers` array. Request body becomes action input.

### RSC Proxy (`/sandbox/*`)

All requests to `/sandbox/*` are proxied to the Vite dev server, which serves the React Server Components.

## Build System

### React Server Components

The runtime uses [RedwoodSDK](https://rwsdk.com/) with Vite for RSC:

1. **Discovery**: Scans `blocks/` directory for React components
2. **Code Generation**: Creates `worker.tsx` with block imports
3. **Vite Build**: Bundles RSC with Flight wire format
4. **Dev Server**: Hot-reloading during development

### PgTyped Integration

SQL queries in `queries.sql` files are processed by PgTyped to generate TypeScript types:

```sql
-- workbook/blocks/sales/queries.sql
/* @name GetRecentSales */
SELECT * FROM sales WHERE date > :startDate LIMIT :limit;
```

Generates:
```typescript
// workbook/blocks/sales/queries.ts
export interface IGetRecentSalesParams { startDate: Date; limit: number; }
export interface IGetRecentSalesResult { id: number; amount: number; date: Date; }
export const getRecentSales = new PreparedQuery<IGetRecentSalesParams, IGetRecentSalesResult>(...);
```

## Configuration

### CLI Arguments

```bash
bun run src/index.ts \
  --workbook-id=my-workbook \
  --workbook-dir=/path/to/workbook \
  --port=56600
```

| Argument | Description | Default |
|----------|-------------|---------|
| `--workbook-id` | Unique identifier for the workbook | Required |
| `--workbook-dir` | Path to workbook directory | Required |
| `--port` | HTTP server port | Auto-assigned |

### Environment Variables

Create `.env.local` in the workbook directory for secrets:

```env
API_KEY=sk-xxx
DATABASE_URL=postgres://...
SLACK_WEBHOOK=https://hooks.slack.com/...
```

Actions declare required secrets in their definition, and they're validated at runtime.

## File Watcher

The runtime watches for changes in the workbook directory:

- **Blocks**: Triggers Vite HMR
- **Sources**: Re-runs schema migrations
- **Actions**: Reloads action definitions

## Service Lifecycle

```
Startup:
  1. Parse CLI args
  2. Start HTTP server (immediate)
  3. Initialize PGlite (async)
  4. Discover sources → create schemas
  5. Discover blocks → generate worker.tsx
  6. Start Vite dev server
  7. Discover actions → start scheduler
  8. Set ready = true

Shutdown:
  1. Stop scheduler
  2. Stop Vite server
  3. Save PGlite to db.tar.gz
  4. Close HTTP server
```

## Development

### Running the Runtime

```bash
cd packages/runtime
bun run src/index.ts \
  --workbook-id=test \
  --workbook-dir=/path/to/workbook \
  --port=55000
```

### Type Checking

```bash
bun run typecheck
```

### Testing an Action

```bash
# Via tRPC
curl -X POST "http://localhost:55000/trpc/actions.run" \
  -H "Content-Type: application/json" \
  -d '{"id": "hello-world"}'

# Via Webhook
curl -X POST "http://localhost:55000/webhook/hello-world" \
  -H "Content-Type: application/json" \
  -d '{"name": "Test"}'
```

## Key Design Decisions

1. **Single Process**: Everything runs in one Node.js process for simplicity and low resource usage
2. **PGlite over SQLite**: PostgreSQL compatibility enables advanced features (JSONB, extensions, roles)
3. **RSC over Client Components**: Server-side rendering with database access, no API layer needed
4. **Progressive Readiness**: Fast startup time, graceful degradation during boot
5. **File-Based Discovery**: No configuration files, just drop files in the right directories
6. **Role-Based Security**: PostgreSQL roles provide defense-in-depth for data access
