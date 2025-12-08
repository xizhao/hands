# Hands Architecture

## Implementation Status

| Component | Status | Notes |
|-----------|--------|-------|
| `hands.json` schema | ✅ Complete | Zod schema with validation |
| `hands build` | ✅ Complete | Generates `.hands/wrangler.toml` and `.hands/worker.ts` |
| `hands init` | ✅ Complete | Creates new workbook scaffold |
| `hands add source` | ✅ Complete | Copies from registry, updates config |
| `hands sources` | ✅ Complete | Lists available sources |
| Runtime integration | ✅ Complete | Auto-builds before wrangler start |
| Legacy fallback | ✅ Complete | Supports old `wrangler.toml` layout |
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
├── src/
│   ├── index.tsx        # Main Hono app (dashboards, API routes)
│   ├── components/      # React components
│   └── lib/             # Utilities
├── sources/             # Data source handlers (copied from registry)
│   ├── hackernews.ts
│   └── github.ts
├── migrations/          # SQL migrations
│   ├── 001_hackernews.sql
│   └── 002_github.sql
├── .hands/              # Generated (gitignored)
│   ├── wrangler.toml    # Auto-generated from hands.json
│   ├── worker.ts        # Generated entry point
│   └── types.d.ts       # Generated types
├── package.json
└── tsconfig.json
```

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
- `hands.json` with defaults
- `src/index.tsx` with Hello World
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

### Input: hands.json + sources/

```
hands.json
sources/
  hackernews.ts
  github.ts
src/
  index.tsx
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

#### .hands/worker.ts

```typescript
// Auto-generated by `hands build` - do not edit

import { Hono } from "hono"
import type { SourceContext } from "@hands/stdlib"

// User's main app
import app from "../src/index"

// Sources
import * as hackernews from "../sources/hackernews"
import * as github from "../sources/github"

// Source runner
async function runSource(
  source: { fetch: (ctx: SourceContext<any>) => AsyncGenerator<any[]> },
  env: Env,
  ctx: ExecutionContext,
  tableName: string
) {
  const cursor = await env.KV?.get(`cursor:${tableName}`)

  const context: SourceContext<any> = {
    secrets: env,
    cursor,
    setCursor: (c) => ctx.waitUntil(env.KV?.put(`cursor:${tableName}`, c)),
    sql: createSqlClient(env),
    log: console.log,
  }

  for await (const batch of source.fetch(context)) {
    await insertBatch(env.DB, tableName, batch)
  }
}

// Worker export
export default {
  fetch: app.fetch,

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    switch (event.cron) {
      case "0 * * * *":
        await runSource(hackernews, env, ctx, "hn_stories")
        break
      case "0 */6 * * *":
        await runSource(github, env, ctx, "github_stars")
        break
    }
  },
}
```

---

## Runtime Integration

The runtime automatically runs `build()` from stdlib before starting wrangler:

```typescript
// runtime/src/wrangler/manager.ts

private async ensureBuild(): Promise<string> {
  const handsJsonPath = join(this.config.workbookDir, "hands.json")
  const handsDir = join(this.config.workbookDir, ".hands")

  // Check if this is a hands.json-based workbook
  if (existsSync(handsJsonPath)) {
    const result = await build(this.config.workbookDir, { dev: true })
    if (!result.success) {
      throw new Error(`Build failed: ${result.errors.join(", ")}`)
    }
    return handsDir
  }

  // Legacy: check for wrangler.toml in root
  const rootWrangler = join(this.config.workbookDir, "wrangler.toml")
  if (existsSync(rootWrangler)) {
    return this.config.workbookDir
  }

  throw new Error("No hands.json or wrangler.toml found")
}
```

### Build on Change

When files change, the runtime:
1. Re-runs `hands build` if `hands.json` or `sources/` changed
2. Wrangler automatically reloads on `.hands/worker.ts` changes

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
| `sources/*.ts` | CLI (copied) | User (customization) |
| `migrations/*.sql` | CLI (copied) | User (can extend) |
| `src/**` | User | User |
| `.hands/*` | Build | Never (regenerated) |
| `wrangler.toml` | DEPRECATED | Remove from workbooks |

---

## Migration Path

### From Current State

1. Remove `wrangler.toml` from workbook root
2. Add `hands.json` with equivalent config
3. Run `hands build` to generate `.hands/`
4. Update `.gitignore` to include `.hands/`

### Backwards Compatibility

If `hands.json` doesn't exist but `wrangler.toml` does:
- Runtime falls back to reading `wrangler.toml` directly
- Print deprecation warning suggesting migration

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
