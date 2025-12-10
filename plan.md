# Workbook Structure Refactor Plan

## Problem Statement

Current workbook structure uses `src/index.tsx` as a catch-all Hono app, bypassing the designed architecture where:
- `blocks/` should contain RSC functions
- `pages/` should contain markdown with embedded blocks
- `sources/` should contain data connectors

The runtime already has discovery code for blocks and pages but workbooks don't use it.

## Current vs Target Structure

```
CURRENT                          TARGET
my-workbook/                     my-workbook/
├── hands.json                   ├── hands.json (enhanced)
├── src/                         ├── blocks/           # NEW
│   └── index.tsx (catch-all)    │   ├── chart.tsx
├── pages/                       │   ├── table.tsx
│   └── untitled.mdx             │   └── ui/           # per-workbook components
├── migrations/                  ├── pages/
├── db/                          │   ├── index.mdx
├── notebook.json                │   └── dashboard.mdx
└── .hands/                      ├── sources/          # NEW (optional)
                                 │   └── github.ts
                                 ├── lib/              # NEW (optional)
                                 │   └── db.ts
                                 ├── migrations/
                                 ├── db/
                                 ├── notebook.json
                                 └── .hands/
```

## Implementation Steps

### Phase 1: Update Workbook Initialization (Rust)

**File: `packages/desktop/src-tauri/src/lib.rs`**

Update `init_workbook()` function to:
1. Remove `src/` directory creation
2. Remove `src/index.tsx` creation
3. Add `blocks/` directory creation
4. Add example block file `blocks/welcome.tsx`
5. Update `pages/` with proper index page that uses the block
6. Add `lib/` directory with `db.ts` helper

### Phase 2: Update Build System

**File: `packages/runtime/src/build/index.ts`**

The build system already discovers blocks/pages correctly. Changes needed:
1. Remove fallback to `src/index.tsx` - the worker should be GENERATED from blocks/pages
2. Update `generateWorkerEntry()` to create a complete Hono app without importing from `src/`
3. Add lib/ directory bundling

### Phase 3: Enhance hands.json Schema

**File: Update hands.json template**

Add configuration for all directories:
```json
{
  "pages": { "dir": "./pages" },
  "blocks": { "dir": "./blocks", "exclude": ["ui/**"] },
  "sources": { "dir": "./sources" },
  "lib": { "dir": "./lib" }
}
```

### Phase 4: Update stdlib Worker Generation

**File: `packages/stdlib/src/build/worker.ts`**

This file generates workers that import from `src/index` - update to be consistent with runtime's approach of generating from blocks/pages.

### Phase 5: Migrate Existing Workbooks

Create a migration script or runtime auto-migration:
1. Detect old-style workbooks (have `src/index.tsx`)
2. Move any custom routes to blocks
3. Create proper structure
4. Remove `src/` directory

## Detailed Changes

### 1. lib.rs - `init_workbook()` (lines 161-263)

```rust
fn init_workbook(workbook_dir: &PathBuf, name: &str, _description: Option<&str>) -> Result<(), String> {
    let slug = name.to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect::<String>();

    // Create directory structure - NO src/
    fs::create_dir_all(workbook_dir.join("blocks"))?;
    fs::create_dir_all(workbook_dir.join("blocks/ui"))?;
    fs::create_dir_all(workbook_dir.join("pages"))?;
    fs::create_dir_all(workbook_dir.join("migrations"))?;
    fs::create_dir_all(workbook_dir.join("lib"))?;

    // Create hands.json with full schema
    let hands_json = serde_json::json!({
        "$schema": "https://hands.dev/schema/hands.json",
        "name": slug,
        "version": "0.0.1",
        "pages": { "dir": "./pages" },
        "blocks": { "dir": "./blocks", "exclude": ["ui/**"] },
        "sources": {},
        "secrets": {},
        "database": { "migrations": "./migrations" }
    });

    // Create example block: blocks/welcome.tsx
    let welcome_block = r#"import type { BlockFn, BlockMeta } from "@hands/stdlib"

export const meta: BlockMeta = {
  title: "Welcome",
  description: "Welcome block for new workbooks",
  refreshable: false
}

const WelcomeBlock: BlockFn<{ name?: string }> = async (props, ctx) => {
  return (
    <div className="p-6 bg-gradient-to-br from-blue-50 to-indigo-100 rounded-xl">
      <h1 className="text-2xl font-bold text-gray-900">
        Welcome to {props.name || "Hands"}
      </h1>
      <p className="mt-2 text-gray-600">
        Create blocks to visualize your data.
      </p>
    </div>
  )
}

export default WelcomeBlock
"#;

    // Create index page: pages/index.mdx
    let index_page = format!(r#"---
title: {}
---

# {}

<Block src="welcome" name="{}" />

Start by creating blocks in the `blocks/` directory.
"#, name, name, name);

    // Create lib/db.ts helper
    let db_helper = r#"// Database helper - re-exported from context for convenience
export type { SqlClient, BlockContext } from "@hands/stdlib"
"#;

    // Write all files...
    // (file writes)
}
```

### 2. runtime/build/index.ts - `generateWorkerEntry()`

Update to generate a standalone worker:

```typescript
function generateWorkerEntry(
  workbookDir: string,
  config: HandsConfig,
  pages: Array<{ route: string; path: string }>,
  blocks: Array<{ id: string; path: string }>
): string {
  // Generate complete Hono app - NO import from src/
  return `// Generated by hands build - do not edit
import { Hono } from "hono"
import { cors } from "hono/cors"
import * as React from "react"
import { renderToString } from "react-dom/server.edge"
import postgres from "postgres"

// ... (rest of generated code - already mostly correct)

// Key change: NO "import app from '../src/index'"
// The app IS the generated code
`
}
```

### 3. Package.json Template Update

Remove hono dependency (it's bundled):
```json
{
  "dependencies": {
    "@hands/stdlib": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5"
  }
}
```

### 4. tsconfig.json Update

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "jsx": "react-jsx",
    "jsxImportSource": "react"
  },
  "include": ["blocks/**/*", "pages/**/*", "lib/**/*"]
}
```

## Testing Plan

1. Create new workbook → verify blocks/ and pages/ exist, no src/
2. Add a block → verify it appears in /blocks endpoint
3. Add a page with block → verify page renders with block
4. Run build → verify .hands/worker.js generated correctly
5. Migrate existing workbook → verify old src/ code still works (backwards compat)

## Migration Strategy

For existing workbooks with `src/index.tsx`:

1. **Detect**: Check if `src/index.tsx` exists
2. **Parallel support**: Build system should check for src/index.tsx and use it as fallback for legacy workbooks
3. **Gradual migration**: Add CLI command `hands migrate` that:
   - Creates blocks/ structure
   - Moves any inline JSX components to blocks/
   - Updates pages to reference blocks
   - Keeps src/ as backup

## Files to Modify

| File | Changes |
|------|---------|
| `packages/desktop/src-tauri/src/lib.rs` | Update init_workbook() |
| `packages/runtime/src/build/index.ts` | Update generateWorkerEntry() |
| `packages/stdlib/src/build/worker.ts` | Align with runtime approach |
| `packages/stdlib/src/build/schema.ts` | Add lib config |

## Risks & Mitigations

1. **Breaking existing workbooks**: Keep src/index.tsx fallback for backwards compatibility
2. **Build performance**: Discovery already cached, minimal impact
3. **Developer experience**: Clear error messages when blocks don't export correctly
