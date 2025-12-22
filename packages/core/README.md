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
- **Block** - Embed MDX blocks or create new components with AI
- **LineChart**, **BarChart**, **AreaChart**, **PieChart** - Data visualization

#### Block Component

The `<Block>` component embeds MDX fragments from `pages/blocks/` or creates new components via AI.

```mdx
<!-- Embed an existing block -->
<Block src="blocks/header" />

<!-- Pass parameters to a block -->
<Block src="blocks/user-card" params={{userId: 123}} />
```

Blocks are MDX files in the `pages/blocks/` subdirectory. They appear in the BlocksPanel and can be embedded into any page.

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

## Plugins (Custom Editor Extensions)

Create custom MDX components that extend the editor stdlib using `createPlugin`:

```typescript
import { createPlugin } from "@hands/core/primitives";

// Define your custom component
const CustomChart = ({ data, type }: { data: unknown[]; type?: string }) => (
  <MyChartLibrary data={data} type={type} />
);

// Create plugin + serialization rule
const { plugin, rule } = createPlugin("CustomChart", CustomChart, {
  isVoid: true,  // No editable children (default: true)
});

// Use in editor
const EditorKit = [...FullKit, plugin];
```

### Plugin Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `isVoid` | `boolean` | `true` | Element has no editable children |
| `isInline` | `boolean` | `false` | Element renders inline |
| `defaults` | `object` | `{}` | Default prop values (not serialized if unchanged) |
| `exclude` | `string[]` | `[]` | Props to exclude from serialization |
| `className` | `string` | `""` | Custom wrapper className |

### Multiple Plugins

Create multiple plugins at once:

```typescript
import { createPlugins } from "@hands/core/primitives";

const { plugins, rules } = createPlugins([
  { tagName: "CustomChart", component: ChartComponent },
  { tagName: "DataTable", component: TableComponent, options: { isVoid: true } },
]);
```

## Content Model

### Terminology

| Concept | Format | Location | Purpose |
|---------|--------|----------|---------|
| **Page** | MDX | `pages/*.mdx` | Routable documents with frontmatter |
| **Block** | MDX | `pages/blocks/*.mdx` | Embeddable page fragments |
| **Plugin** | TSX | Custom code | Editor extensions via `createPlugin` |

### Directory Structure

```
workbook/
  pages/
    dashboard.mdx        # Page - routable, shown in nav
    settings.mdx         # Page - routable, shown in nav
    blocks/              # Blocks subdirectory (auto-created)
      header.mdx         # Block - embeddable, shown in BlocksPanel
      footer.mdx         # Block - embeddable, shown in BlocksPanel
```
