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
import { ViewKit, ActionKit, DataKit } from "@hands/core/stdlib";

// Import individual plugins
import { LiveValuePlugin } from "@hands/core/stdlib/view";
import { LiveActionPlugin, ButtonPlugin } from "@hands/core/stdlib/action";
import { DataGridPlugin, KanbanPlugin } from "@hands/core/stdlib/data";

// Import types
import type { TLiveValueElement, TLiveActionElement } from "@hands/core/types";

// Import docs for agent prompts
import { STDLIB_DOCS } from "@hands/core/docs/stdlib";
```

### View Components

Display-only components that render live data from SQL queries.

- **LiveValue** - Display SQL results as inline value, list, or table
- **Metric** - KPI display with number, label, and change indicator
- **Badge** - Inline status indicator
- **Progress** - Progress bar
- **Alert** - Callout message box
- **Loader** - Loading indicator
- **LineChart**, **BarChart**, **AreaChart**, **PieChart** - Data visualization

### Action Components

Interactive components that handle user input and execute SQL mutations.

- **LiveAction** - Container that executes SQL on form submit
- **ActionButton** - Triggers parent LiveAction
- **ActionInput** - Text input with form binding
- **ActionSelect** - Dropdown with form binding
- **ActionCheckbox** - Checkbox with form binding
- **ActionTextarea** - Multiline text with form binding

### Data Components

Self-contained data management with CRUD operations.

- **DataGrid** - High-performance editable data grid
- **Kanban** - Drag-and-drop board for grouped data

## Documentation Generation

Components are documented via JSDoc annotations:

```tsx
/**
 * @component LiveValue
 * @category view
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
