# @hands/core

Core package for the Hands data application framework. Contains the standard library (stdlib) of components and shared type definitions to define workbook structure and markdown grammar of hands runtime.

## What belongs in core?

- Stdlib components
- todo: Core workbook primitives (soon, like pages, blocks, actions definitions, maybe table)
- todo: validation stuff (somehow something needs to lint?)

# Stdlib

## Usage

```typescript
// Import plugin kits for Plate editor
import { StdlibKit } from "@hands/core/stdlib";
import { StaticKit, ActiveKit } from "@hands/core/stdlib";

// Import individual plugins
import { LiveValuePlugin } from "@hands/core/stdlib/static";
import { LiveActionPlugin, ButtonPlugin } from "@hands/core/stdlib/active";

// Import types
import type { TLiveValueElement, TLiveActionElement } from "@hands/core/types";

// Import docs for agent prompts
import { STDLIB_DOCS } from "@hands/core/docs/stdlib";
```

### Static Components

Display-only components that render live data from SQL queries.

- **LiveValue** - Display SQL results as inline value, list, or table

### Active Components

Interactive components that handle user input and execute SQL mutations.

- **LiveAction** - Container that executes SQL on form submit
- **ActionButton** - Triggers parent LiveAction
- **ActionInput** - Text input with form binding
- **ActionSelect** - Dropdown with form binding
- **ActionCheckbox** - Checkbox with form binding
- **ActionTextarea** - Multiline text with form binding

## Documentation Generation

Components are documented via JSDoc annotations:

```tsx
/**
 * @component LiveValue
 * @category static
 * @description Displays live SQL query results.
 * @keywords sql, query, data, display
 * @example
 * <LiveValue sql="SELECT count(*) FROM users" />
 */
```

Generate documentation:

```bash
bun run generate:docs
```

This produces:

- `docs/components.md` - Human/agent-readable reference
- `docs/registry.json` - Structured metadata for tooling
- `docs/stdlib.ts` - TypeScript exports for agent system prompts
