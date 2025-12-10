# Hands Architecture

## Implementation Status

| Component | Status | Notes |
|-----------|--------|-------|
| `hands.json` schema | ✅ Complete | Zod schema with validation |
| `hands build` | ✅ Complete | Generates `.hands/wrangler.toml` and `.hands/worker.js` |
| `hands init` | ✅ Complete | Creates blocks/pages scaffold |
| `hands add source` | ✅ Complete | Copies from registry, updates config |
| `hands sources` | ✅ Complete | Lists available sources |
| Runtime integration | ✅ Complete | Auto-builds before wrangler start |
| Block discovery | ✅ Complete | Auto-discovers blocks/*.tsx |
| Page discovery | ✅ Complete | Auto-discovers pages/*.md |
| HackerNews source | ✅ Complete | In registry |
| GitHub source | ✅ Complete | In registry |
| Migrations runner | ⏳ Pending | Need to implement |
| `hands deploy` | ⏳ Pending | Need to implement |

---

## Overview

Hands is a data analysis desktop app that combines:
- **Workbooks**: User projects containing dashboards, charts, and data sources
- **Runtime**: Local dev server with embedded PostgreSQL and Cloudflare Workers
- **Stdlib**: Shared library with components, sources, and CLI tools

## Package Responsibilities

```
packages/
├── stdlib/       # Shared library (components, sources, CLI, types)
├── runtime/      # Dev server (postgres, wrangler, eval)
├── desktop/      # Tauri + React app
└── workbook-*/   # User workbooks
```

### stdlib
- **Config schema**: `hands.json` type definitions and validation
- **Sources**: Registry of polling data connectors (GitHub, HN, etc.)
- **CLI**: `hands init`, `hands add`, `hands build` commands
- **Components**: SST components for deployment (DataStore, Monitor, etc.)
- **Runtime helpers**: `sql`, `dashboard`, `monitor` functions for user code

### runtime
- **Embedded PostgreSQL**: Managed postgres instance per workbook
- **Wrangler**: Runs Cloudflare Workers dev server
- **Eval**: Continuous code quality (tsc, biome, knip)
- **File watching**: Triggers rebuilds on source changes

### desktop
- **UI**: React app for managing workbooks, viewing dashboards
- **Tauri**: Native shell, spawns runtime processes

---

## Workbook Structure

```
my-workbook/
├── hands.json           # Single source of truth
├── blocks/              # RSC (React Server Component) functions
│   ├── welcome.tsx      # Example block
│   ├── chart.tsx        # Chart block
│   └── ui/              # Per-workbook UI components (excluded from block discovery)
├── pages/               # Markdown pages with embedded blocks
│   ├── index.md         # Home page
│   └── dashboard.md     # Dashboard page
├── sources/             # Data source handlers (copied from registry)
│   ├── hackernews.ts
│   └── github.ts
├── lib/                 # Shared utilities
│   └── db.ts            # Database helpers
├── migrations/          # SQL migrations
│   ├── 001_hackernews.sql
│   └── 002_github.sql
├── .hands/              # Generated (gitignored)
│   ├── wrangler.toml    # Auto-generated from hands.json
│   ├── worker.js        # Bundled worker entry point
│   └── worker.src.ts    # Generated source (for debugging)
├── package.json
└── tsconfig.json
```

### Key Directories

- **blocks/**: Contains RSC block functions. Each block exports a default async function and optional `meta` for title/description. Blocks are rendered via `/blocks/:id` routes.
- **pages/**: Contains markdown files with YAML frontmatter. Pages can embed blocks using `<Block id="name" prop="value" />` syntax.
- **sources/**: Data connectors that run on cron schedules. Copied from the stdlib registry.
- **lib/**: Shared utilities and helpers (not bundled as blocks).

---

## hands.json

The `hands.json` file is the single source of truth for workbook configuration. It replaces the need for users to manually edit `wrangler.toml`.

```json
{
  "$schema": "https://hands.dev/schema/hands.json",
  "name": "my-workbook",
  "version": "0.1.0",

  "sources": {
    "hackernews": {
      "enabled": true,
      "schedule": "0 * * * *",
      "options": {
        "streams": ["top", "new"],
        "limit": 100
      }
    },
    "github": {
      "enabled": true,
      "schedule": "0 */6 * * *",
      "options": {
        "repos": ["my-org/my-repo"],
        "streams": ["stars", "issues"]
      }
    }
  },

  "secrets": {
    "GITHUB_TOKEN": { "required": true, "description": "GitHub PAT with repo scope" }
  },

  "database": {
    "migrations": "./migrations"
  },

  "build": {
    "outDir": ".hands"
  }
}
```

### Why hands.json?

1. **Single source of truth**: No need to keep `wrangler.toml` in sync manually
2. **Typed configuration**: Full TypeScript types and JSON schema validation
3. **Source options**: Configure sources without editing copied files
4. **Secrets manifest**: Document required secrets for deployment
5. **Portable**: Easy to share, version control, and deploy

---

## CLI Commands

The CLI is built into stdlib and invoked via `bunx hands` or `npx hands`.

### `hands init`

Creates a new workbook with default structure:

```bash
hands init my-workbook
cd my-workbook
```

Creates:
- `hands.json` with pages/blocks/sources configuration
- `blocks/welcome.tsx` with example block
- `pages/index.md` with embedded block
- `lib/db.ts` with database helpers
- `package.json` with dependencies
- `tsconfig.json`

### `hands add source <name>`

Adds a source from the registry:

```bash
hands add source hackernews
hands add source github
```

This command:
1. Copies source files from stdlib registry to `sources/`
2. Copies migration SQL to `migrations/`
3. Updates `hands.json` with source config
4. Prints next steps (e.g., set GITHUB_TOKEN)

### `hands build`

Generates the `.hands/` directory from `hands.json`:

```bash
hands build
```

Generates:
- `.hands/wrangler.toml` - Cloudflare Workers config
- `.hands/worker.ts` - Entry point that routes crons to sources
- `.hands/types.d.ts` - Type definitions for env bindings

### `hands dev`

Alias for running the runtime (delegates to runtime package):

```bash
hands dev
```

Equivalent to:
```bash
bun run @hands/runtime --workbook-dir=. --workbook-id=$(jq -r .name hands.json)
```

---

## Build Process

### Input: hands.json + blocks/ + pages/

```
hands.json
blocks/
  welcome.tsx
  chart.tsx
pages/
  index.md
  dashboard.md
sources/
  hackernews.ts
  github.ts
```

### Output: .hands/

#### .hands/wrangler.toml

```toml
# Auto-generated by `hands build` - do not edit
# Source: hands.json

name = "my-workbook"
main = "worker.ts"
compatibility_date = "2024-01-01"
compatibility_flags = ["nodejs_compat"]

[triggers]
crons = ["0 * * * *", "0 */6 * * *"]

[vars]
ENVIRONMENT = "development"

# Secrets (set via wrangler secret put)
# GITHUB_TOKEN - GitHub PAT with repo scope
```

#### .hands/worker.src.ts

```typescript
// Generated by hands build system - do not edit directly

import { Hono } from "hono";
import { cors } from "hono/cors";
import * as React from "react";
import { renderToString } from "react-dom/server.edge";
import postgres from "postgres";

// Page contents (embedded at build time)
const PAGE_CONTENTS: Record<string, string> = {
  "/": `---\ntitle: My Workbook\n---\n\n# My Workbook\n\n<Block id="welcome" />\n`,
  "/dashboard": `---\ntitle: Dashboard\n---\n\n# Dashboard\n\n<Block id="chart" query="SELECT * FROM data" />\n`,
};

const app = new Hono<{ Bindings: { DATABASE_URL: string } }>();

app.use("/*", cors());

// Health check
app.get("/health", (c) => c.json({ status: "ok" }));

// Block routes (generated from blocks/)
app.get("/blocks/welcome", async (c) => {
  const { default: BlockFn } = await import("../blocks/welcome");
  const ctx = createBlockContext(c.env.DATABASE_URL, c.env, c.req.param());
  const element = await BlockFn({}, ctx);
  return c.html(renderToString(element));
});

// Page routes (generated from pages/)
app.get("/", async (c) => {
  const content = PAGE_CONTENTS["/"];
  const html = await renderPage(content, { db: createDb(c.env.DATABASE_URL) });
  return c.html(html);
});

export default app;
```

---

## Runtime Integration

The runtime automatically runs `build()` from stdlib before starting wrangler:

```typescript
// runtime/src/wrangler/manager.ts

private async ensureBuild(): Promise<string> {
  const handsJsonPath = join(this.config.workbookDir, "hands.json")
  const handsDir = join(this.config.workbookDir, ".hands")

  if (!existsSync(handsJsonPath)) {
    throw new Error("No hands.json found - workbooks require hands.json")
  }

  // Build worker from blocks/pages discovery
  const result = await build(this.config.workbookDir, { dev: true })
  if (!result.success) {
    throw new Error(`Build failed: ${result.errors.join(", ")}`)
  }
  return handsDir
}
```

### Build on Change

When files change, the runtime:
1. Re-runs `hands build` if `hands.json`, `blocks/`, or `pages/` changed
2. Wrangler automatically reloads on `.hands/worker.js` changes

---

## Source Lifecycle

### 1. Registry (stdlib)

Sources live in `stdlib/src/sources/registry/`:

```
registry/
├── hackernews/
│   ├── source.ts      # Handler code
│   └── migration.sql  # Table schema
├── github/
│   ├── source.ts
│   └── migration.sql
└── registry.json      # Index of all sources
```

### 2. Add to Workbook

`hands add source hackernews`:

1. Read `registry.json` to find source metadata
2. Copy `source.ts` to `workbook/sources/hackernews.ts`
3. Copy `migration.sql` to `workbook/migrations/001_hackernews.sql`
4. Update `hands.json`:
   ```json
   {
     "sources": {
       "hackernews": {
         "enabled": true,
         "schedule": "0 * * * *",
         "options": {}
       }
     }
   }
   ```

### 3. Configure

User edits `hands.json` to customize:

```json
{
  "sources": {
    "hackernews": {
      "schedule": "*/30 * * * *",
      "options": {
        "streams": ["top", "best"],
        "limit": 50
      }
    }
  }
}
```

### 4. Build

`hands build` generates `.hands/worker.ts` with:
- Import for each enabled source
- Switch case routing crons to sources
- Options passed to source context

### 5. Run

Runtime:
1. Runs migrations against embedded postgres
2. Starts wrangler with `.hands/wrangler.toml`
3. Sources execute on their cron schedules
4. Data flows into postgres tables

---

## File Ownership

| File | Owner | Edited By |
|------|-------|-----------|
| `hands.json` | User | User, CLI |
| `blocks/*.tsx` | User | User |
| `pages/*.md` | User | User |
| `sources/*.ts` | CLI (copied) | User (customization) |
| `lib/*.ts` | User | User |
| `migrations/*.sql` | CLI (copied) | User (can extend) |
| `.hands/*` | Build | Never (regenerated) |

---

## Future Considerations

### Deploy

```bash
hands deploy
```

- Runs `hands build` with production settings
- Deploys to Cloudflare Workers
- Sets up D1 database, KV namespace
- Configures secrets from environment or prompts

### Source Options Schema

Each source can define a Zod schema for its options:

```typescript
// sources/github.ts
export const optionsSchema = z.object({
  repos: z.array(z.string()),
  streams: z.array(z.enum(["stars", "issues", "pull_requests"])),
  limit: z.number().default(100),
})
```

The CLI validates `hands.json` options against this schema.

### Remote Registry

```bash
hands add source @community/stripe
```

Fetch sources from a remote registry (GitHub, npm, or custom).
