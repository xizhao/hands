# Hands Workbook - Serverless Data App Framework

## Vision

A **Workbook** is a portable, publishable data application:

```
Workbook = Local-First Data App → Deployable to Edge
├── Plate Editor (UI canvas)
│   └── Blocks = RSC endpoints served from worker
│       ├── OpenCode agent writes .tsx files
│       ├── Worker compiles & serves RSC
│       └── Editor fetches & renders output
│
├── Embedded PostgreSQL (local) / PGlite (published <10MB)
│   └── Populated by background jobs & integrations
│
├── Cloudflare Worker Runtime
│   ├── RSC block rendering
│   ├── Background jobs (cron, queues)
│   ├── API routes & integrations
│   └── Data sync pipelines
│
└── `hands publish` → Standalone Cloudflare app
```

---

## Architecture

### Local Development

```
┌─────────────────────────────────────────────────────────────┐
│                     Tauri Desktop App                        │
├─────────────────────────────────────────────────────────────┤
│  Plate Editor                                                │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ Block: /blocks/abc123 ──fetch──► Worker RSC endpoint    ││
│  │ Block: /blocks/def456 ──fetch──► Worker RSC endpoint    ││
│  │ Block: /blocks/ghi789 ──fetch──► Worker RSC endpoint    ││
│  └─────────────────────────────────────────────────────────┘│
│                            │                                 │
│  ChatOverlay (OpenCode)    │                                 │
│  ┌──────────────────┐      │                                 │
│  │ "Add a chart..." │──────┼──► writes blocks/ghi789.tsx    │
│  └──────────────────┘      │                                 │
├────────────────────────────┼────────────────────────────────┤
│            Wrangler Dev Server (localhost:worker_port)       │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ GET /blocks/:id  → Compile & render RSC                 ││
│  │ POST /api/*      → API routes                           ││
│  │ CRON jobs        → Background data pipelines            ││
│  └─────────────────────────────────────────────────────────┘│
│                            │                                 │
├────────────────────────────┼────────────────────────────────┤
│            Embedded PostgreSQL (localhost:pg_port)           │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ public.* ← user tables                                  ││
│  │ _hands.* ← sync metadata, block cache                   ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

### Published (Cloudflare)

```
┌─────────────────────────────────────────────────────────────┐
│                    Cloudflare Worker                         │
├─────────────────────────────────────────────────────────────┤
│  Static: index.html + Plate Editor bundle                    │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ Same editor, fetches /blocks/:id from same worker       ││
│  └─────────────────────────────────────────────────────────┘│
├─────────────────────────────────────────────────────────────┤
│  Worker Routes:                                              │
│  │ GET /blocks/:id  → RSC render                            │
│  │ POST /api/*      → API routes                            │
│  │ Cron triggers    → Background jobs                       │
├─────────────────────────────────────────────────────────────┤
│  Data Layer (conditional):                                   │
│  │ < 10MB  → PGlite in Worker (WASM SQLite-compatible)      │
│  │ > 10MB  → Neon/Supabase/Turso connection                 │
└─────────────────────────────────────────────────────────────┘
```

---

## Workbook Directory Structure

```
~/.hands/<workbook-id>/
├── .git/                      # Workbook is a git repo
├── hands.json                 # Workbook manifest
├── blocks/
│   ├── abc123.tsx             # RSC block (agent-generated)
│   ├── def456.tsx
│   └── ghi789.tsx
├── api/
│   ├── sync.ts                # API route for data sync
│   └── webhook.ts             # Webhook handler
├── jobs/
│   ├── daily-sync.ts          # Cron job
│   └── process-queue.ts       # Queue consumer
├── lib/
│   ├── db.ts                  # Database client
│   └── utils.ts               # Shared utilities
├── data/
│   └── postgres/              # Embedded PG data dir
├── notebook.json              # Plate editor state (block layout)
└── wrangler.toml              # Worker config (generated)
```

### hands.json (Workbook Manifest)

```json
{
  "id": "wb_abc123",
  "name": "Sales Dashboard",
  "version": "1.0.0",
  "blocks": {
    "abc123": { "title": "Revenue Chart", "file": "blocks/abc123.tsx" },
    "def456": { "title": "Customer Table", "file": "blocks/def456.tsx" }
  },
  "jobs": {
    "daily-sync": { "cron": "0 0 * * *", "file": "jobs/daily-sync.ts" }
  },
  "dataSources": [
    { "id": "stripe", "type": "http-json", "schedule": "0 * * * *" }
  ],
  "publish": {
    "dataStrategy": "pglite",
    "connectionString": "..."
  }
}
```

---

## Block System

### Block File (Agent-Generated TSX)

```tsx
// blocks/abc123.tsx
import { db } from '../lib/db';

export async function Block() {
  const revenue = await db.query(`
    SELECT date, sum(amount) as total
    FROM orders
    GROUP BY date
    ORDER BY date DESC
    LIMIT 30
  `);

  return (
    <div className="p-4">
      <h2 className="text-lg font-semibold">Revenue (Last 30 Days)</h2>
      <LineChart data={revenue.rows} x="date" y="total" />
    </div>
  );
}

export const meta = {
  title: "Revenue Chart",
  refreshable: true,
  inputs: []  // future: user-configurable inputs
};
```

### Block Rendering Flow

1. **Editor** mounts block placeholder with `blockId`
2. **Plate RSCBlock component** fetches `GET /blocks/{blockId}`
3. **Worker** imports `blocks/{blockId}.tsx`, renders RSC
4. **Response** returns rendered React tree (RSC wire format)
5. **Editor** hydrates RSC into block container
6. **Refresh** button re-fetches, re-renders

### Block in Plate Editor State

```typescript
// notebook.json (Plate document)
{
  "children": [
    { "type": "heading", "level": 1, "children": [{ "text": "Sales Dashboard" }] },
    { "type": "rsc-block", "blockId": "abc123", "children": [{ "text": "" }] },
    { "type": "paragraph", "children": [{ "text": "Analysis notes..." }] },
    { "type": "rsc-block", "blockId": "def456", "children": [{ "text": "" }] }
  ]
}
```

---

## Data Layer

### Local: Embedded PostgreSQL (existing)

- Already implemented in `packages/runtime`
- Each workbook has isolated database
- Full PostgreSQL feature set

### Published: Conditional Strategy

```typescript
// lib/db.ts - unified interface
import { createClient } from './db-client';

// Environment-aware: uses PGlite in worker, Postgres locally
export const db = createClient({
  // Auto-detected from environment
  local: process.env.POSTGRES_URL,      // embedded pg
  worker: process.env.DATABASE_URL,      // pglite or external
});
```

**Strategy selection in `hands.json`:**

| Data Size | Strategy | Notes |
|-----------|----------|-------|
| < 10MB | `pglite` | SQLite-compatible, runs in Worker WASM |
| 10MB-1GB | `neon` | Serverless Postgres, free tier available |
| > 1GB | `supabase`/`turso` | Managed Postgres or distributed SQLite |

### PGlite Integration

```typescript
// When published with pglite strategy:
// 1. Export local PG to SQL dump
// 2. Convert to SQLite-compatible schema
// 3. Bundle as static asset in worker
// 4. PGlite loads and queries in-memory
```

---

## Agent Block Authoring

### Prompt → Block Creation Flow

```
User: "Add a chart showing monthly revenue by product category"
          │
          ▼
┌─────────────────────────────────────────────┐
│ OpenCode Agent                               │
│ 1. Queries DB schema (tables, columns)      │
│ 2. Generates SQL for the visualization      │
│ 3. Writes blocks/xyz789.tsx                 │
│ 4. Updates hands.json manifest              │
│ 5. Inserts rsc-block into notebook.json     │
└─────────────────────────────────────────────┘
          │
          ▼
Worker hot-reloads, editor fetches new block
```

### Agent Tools Required

```typescript
// New tools for OpenCode agent

// 1. Create/update block file
tool("hands_write_block", {
  blockId: string,
  code: string,  // TSX content
  meta: { title: string, refreshable: boolean }
});

// 2. Insert block into notebook
tool("hands_insert_block", {
  blockId: string,
  position: "end" | "after:{blockId}" | "before:{blockId}"
});

// 3. Query database schema (existing, enhance)
tool("hands_db_schema", {
  tables?: string[]  // filter to specific tables
});

// 4. Test block render
tool("hands_render_block", {
  blockId: string
}) → { html: string, error?: string }
```

---

## Dependencies

### New Packages

```json
{
  "@udecode/plate": "^40.0.0",
  "@udecode/plate-dnd": "^40.0.0",
  "@electric-sql/pglite": "^0.2.0",
  "react-server-dom-webpack": "^18.3.0"
}
```

### Worker Runtime (existing wrangler setup)

- Already have wrangler dev server in runtime
- Need to add RSC rendering endpoint
- Need to add block file watching/hot reload

---

## Implementation Phases

### Phase 1: RSC Block Infrastructure (Days 1-3)

**Goal:** Worker serves RSC blocks, editor fetches and renders them

1. **Worker RSC endpoint** (`packages/runtime/src/server.ts`)
   ```typescript
   app.get('/blocks/:blockId', async (c) => {
     const blockPath = `${workbookDir}/blocks/${blockId}.tsx`;
     const mod = await import(blockPath);
     const stream = renderToReadableStream(<mod.Block />);
     return new Response(stream, {
       headers: { 'Content-Type': 'text/x-component' }
     });
   });
   ```

2. **RSC client in desktop** (`packages/desktop/src/lib/rsc-client.ts`)
   ```typescript
   import { createFromFetch } from 'react-server-dom-webpack/client';

   export async function fetchBlock(blockId: string, port: number) {
     const response = fetch(`http://localhost:${port}/blocks/${blockId}`);
     return createFromFetch(response);
   }
   ```

3. **Plate RSC Block plugin** (`packages/desktop/src/components/plate-editor/plugins/rsc-block/`)
   - Void block element that fetches and renders RSC
   - Loading, error, refresh states
   - Block toolbar (refresh, edit, delete)

4. **Block file watcher**
   - Watch `blocks/*.tsx` for changes
   - Trigger re-render in editor on change

---

### Phase 2: Editor Shell & Tabs (Days 4-5)

**Goal:** Tabbed workbook view with Plate editor

1. **WorkbookView container** with tabs: Sources | Data | Insights | Preview
2. **PreviewTab** - Plate editor with RSC block plugin
3. **DataTab** - Embed existing DbBrowser
4. **SourcesTab** - File tree (blocks/, api/, jobs/)
5. **ChatOverlay** - Floating OpenCode interface

Same as previous plan but with RSC blocks instead of static components.

---

### Phase 3: Agent Block Authoring (Days 6-8)

**Goal:** OpenCode agent can create and modify blocks

1. **New agent tools** in `.opencode/tool/`
   - `hands_write_block.ts` - Write block TSX file
   - `hands_insert_block.ts` - Add block to notebook
   - `hands_render_block.ts` - Test render a block

2. **Block creation agent** in `.opencode/agent/`
   ```markdown
   ---
   description: Creates data visualization blocks
   tools:
     hands_write_block: true
     hands_insert_block: true
     hands_db_schema: true
   ---
   You create RSC blocks for data visualization...
   ```

3. **Block templates** - Common patterns agent can reference
   - Chart block (line, bar, pie)
   - Table block with pagination
   - Metric card block
   - Form input block

---

### Phase 4: Background Jobs & Integrations (Days 9-10)

**Goal:** Data pipelines populate the database

1. **Job execution in worker**
   ```typescript
   // wrangler.toml
   [triggers]
   crons = ["0 * * * *"]  # hourly

   // jobs/sync-stripe.ts
   export async function scheduled(event, env, ctx) {
     const data = await fetchStripeData(env.STRIPE_KEY);
     await env.DB.batch(upsertStatements(data));
   }
   ```

2. **Job management UI** in SourcesTab
   - List jobs with last run status
   - Manual trigger button
   - View logs

3. **Data source sync** (existing, wire up)
   - Connect existing `useDataSync` hooks
   - Show sync status in UI

---

### Phase 5: Publish to Cloudflare (Days 11-13)

**Goal:** `hands publish` deploys workbook as standalone app

1. **Build command** (`packages/cli/src/commands/publish.ts`)
   ```typescript
   // 1. Bundle editor + blocks into static assets
   // 2. Generate wrangler.toml with routes
   // 3. Export DB based on strategy (pglite dump or connection string)
   // 4. Run `wrangler deploy`
   ```

2. **PGlite export** for small datasets
   ```typescript
   // Export PG to SQL, convert to SQLite, bundle as asset
   pg_dump → schema conversion → sqlite import → .db file
   ```

3. **Environment config**
   - Local: embedded PG
   - Published: PGlite WASM or external DB URL

4. **Published app structure**
   ```
   dist/
   ├── index.html          # Plate editor shell
   ├── assets/             # JS/CSS bundles
   ├── _worker.js          # Cloudflare Worker
   └── data.db             # PGlite database (if using pglite)
   ```

---

### Phase 6: Git & Polish (Days 14-15)

**Goal:** Version control, autosave, refinements

1. **Git integration** (Tauri commands)
   - Status, commit, log, diff
   - UI in SourcesTab

2. **Autosave**
   - Debounced notebook.json save
   - Block file save on agent write

3. **Block editing UX**
   - Click block to see source
   - Inline edit mode (future)
   - Duplicate, reorder blocks

---

## Critical Files

| Purpose | Path |
|---------|------|
| Worker server | `packages/runtime/src/server.ts` |
| RSC rendering | `packages/runtime/src/rsc/` (new) |
| Plate editor | `packages/desktop/src/components/plate-editor/` |
| RSC block plugin | `packages/desktop/src/components/plate-editor/plugins/rsc-block/` |
| RSC client | `packages/desktop/src/lib/rsc-client.ts` |
| Agent tools | `.opencode/tool/hands_*.ts` |
| Block agent | `.opencode/agent/block-builder.md` |
| Publish CLI | `packages/cli/src/commands/publish.ts` (new) |

---

## Key Design Decisions

1. **RSC over static components** - Blocks are server-rendered, data-fetching components, not just config
2. **Agent writes real code** - Full TSX files, not templates, maximum flexibility
3. **Each block = endpoint** - Independent rendering, caching, refresh
4. **PGlite for small deploys** - No external DB needed under 10MB
5. **Same worker local & deployed** - Wrangler dev === Cloudflare prod

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| RSC complexity in Tauri | Use react-server-dom-webpack client, well-documented |
| PGlite schema compatibility | Subset of PG features, test common patterns |
| Agent writes broken code | Render test tool, syntax validation, error display in block |
| Worker cold starts | PGlite is fast, external DB adds latency |
| Large dataset publish | Force external DB strategy above threshold |
