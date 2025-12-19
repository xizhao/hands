/**
 * Markdown Grammar Guide for Hands Pages
 *
 * Documents all markdown syntax, MDX extensions, and Plate serialization.
 * Keep this concise - it goes in system prompts.
 */

// ============================================================================
// Core Markdown Grammar
// ============================================================================

export const MARKDOWN_SYNTAX = `
## Markdown Syntax

Standard markdown with GFM (GitHub Flavored Markdown) and MDX extensions.

### Block Elements

| Syntax | Element | Autoformat |
|--------|---------|------------|
| \`# Text\` | H1 heading | Type \`# \` at line start |
| \`## Text\` | H2 heading | Type \`## \` |
| \`### Text\` | H3 heading | Type \`### \` |
| \`> Text\` | Blockquote | Type \`> \` |
| \`\`\`\`\`\` | Code block | Type \`\`\`\`\`\` |
| \`---\` | Horizontal rule | Type \`---\` or \`___\` |
| \`+ \` | Toggle/collapsible | Type \`+ \` |

### Lists

| Syntax | Element | Autoformat |
|--------|---------|------------|
| \`* \` or \`- \` | Bullet list | Type at line start |
| \`1. \` or \`1) \` | Numbered list | Type number + period/paren |
| \`[] \` | Todo (unchecked) | Type \`[] \` |
| \`[x] \` | Todo (checked) | Type \`[x] \` |

### Inline Formatting

| Syntax | Element | Keyboard |
|--------|---------|----------|
| \`**text**\` | Bold | Cmd+B |
| \`*text*\` or \`_text_\` | Italic | Cmd+I |
| \`__text__\` | Underline | Cmd+U |
| \`~~text~~\` | Strikethrough | |
| \`^text^\` | Superscript | |
| \`~text~\` | Subscript | |
| \`\\\`code\\\`\` | Inline code | |
| \`***text***\` | Bold + Italic | |

### Tables (GFM)

\`\`\`markdown
| Header 1 | Header 2 |
|----------|----------|
| Cell 1   | Cell 2   |
\`\`\`

### Smart Typography (Auto-converted)

- \`"quotes"\` -> curly quotes
- \`--\` -> en-dash, \`---\` -> em-dash
- \`...\` -> ellipsis
- \`->\` -> arrow symbols
- \`(c)\`, \`(r)\`, \`(tm)\` -> copyright/trademark
`;

// ============================================================================
// Frontmatter
// ============================================================================

export const FRONTMATTER_DOCS = `
## Frontmatter

YAML metadata at the top of pages:

\`\`\`markdown
---
title: Page Title
description: Optional subtitle
---

# Content starts here...
\`\`\`

### API Functions

\`\`\`typescript
import {
  parseFrontmatter,     // Parse YAML from source
  serializeFrontmatter, // Convert to YAML string
  stripFrontmatter,     // Get content without frontmatter
  updateFrontmatter,    // Update frontmatter in source
} from "@/components/page-editor/frontmatter";

// Parse
const { frontmatter, contentStart } = parseFrontmatter(source);
// frontmatter.title, frontmatter.description, etc.

// Serialize (for saving)
const yaml = serializeFrontmatter({ title: "My Page", description: "..." });
// Returns: "---\\ntitle: My Page\\n---\\n\\n"
\`\`\`
`;

// ============================================================================
// LiveQuery - Block-Level Data Display
// ============================================================================

export const LIVEQUERY_DOCS = `
## LiveQuery (Block Element)

Renders SQL query results as rich content. Supports template mode, table mode, and auto-pick mode.

### MDX Syntax

\`\`\`mdx
<!-- Auto-pick mode: detects best display automatically -->
<LiveQuery query="SELECT COUNT(*) as total FROM orders" />

<!-- Table mode: explicit columns -->
<LiveQuery query="SELECT * FROM customers" columns="auto" />

<!-- Template mode: custom rendering with bindings -->
<LiveQuery query="SELECT name, revenue FROM top_customers LIMIT 5">
## {{name}}
Revenue: **${{revenue}}**
</LiveQuery>
\`\`\`

### Template Bindings

Use \`{{field}}\` syntax inside LiveQuery children:
- \`{{fieldName}}\` - exact column match
- \`{{value}}\` or \`{{name}}\` - fallback to first column
- \`{{_index}}\` - current row number (1-indexed)

### Auto-Pick Display Modes

Based on data shape, LiveQuery auto-selects:
- **1 row, 1 col** -> Big metric (e.g., "12,345")
- **1 row, N cols** -> Key-value card layout
- **N rows, 1 col** -> Bullet list
- **N rows, 2 cols** -> Label-value pairs
- **N rows, N cols** -> HTML table

### Built-in Templates

\`\`\`typescript
import { TEMPLATES } from "@/components/page-editor/plugins/live-query-kit";

// Available: "metric", "stat-card", "bullet-list", "numbered-list", "card", "row", "table"
\`\`\`

### Plate Element Type

\`\`\`typescript
interface TLiveQueryElement extends TElement {
  type: "live_query";
  query: string;                    // SQL query
  params?: Record<string, unknown>; // Named parameters
  columns?: ColumnConfig[] | "auto"; // Table mode config
  className?: string;               // CSS class
  children: (TElement | TText)[];   // Template content
}
\`\`\`

### Creating LiveQuery Elements

\`\`\`typescript
import {
  createLiveQueryElement,
  createTableQuery,
  createTemplateQuery,
} from "@/components/page-editor/plugins/live-query-kit";

// Generic
const element = createLiveQueryElement("SELECT * FROM users", {
  columns: "auto",
});

// Table mode shorthand
const tableEl = createTableQuery("SELECT * FROM users");

// Template mode shorthand
const templateEl = createTemplateQuery("SELECT name FROM users", [
  { type: "p", children: [{ text: "User: {{name}}" }] },
]);
\`\`\`
`;

// ============================================================================
// LiveValue - Inline Data Display
// ============================================================================

export const LIVEVALUE_DOCS = `
## LiveValue (Inline Element)

Renders a single SQL value as an inline badge within text.

### MDX Syntax

\`\`\`mdx
We have <LiveValue query="SELECT COUNT(*) FROM customers" /> active customers.

Revenue this month: <LiveValue query="SELECT SUM(amount) FROM orders WHERE date > '2024-01-01'" />
\`\`\`

### Rendering

Displays as a violet badge with lightning bolt icon:
- Shows first column of first row
- Loading spinner while fetching
- Error indicator on failure

### Plate Element Type

\`\`\`typescript
interface TInlineLiveQueryElement extends TElement {
  type: "live_query_inline";
  query: string;                    // SQL query
  params?: Record<string, unknown>; // Named parameters
  className?: string;               // CSS class
  children: [{ text: "" }];         // Void element
}
\`\`\`

### Creating LiveValue Elements

\`\`\`typescript
import { createInlineLiveQueryElement } from "@/components/page-editor/plugins/live-query-kit";

const element = createInlineLiveQueryElement("SELECT COUNT(*) FROM users");
\`\`\`
`;

// ============================================================================
// Block Element - Sandboxed Components
// ============================================================================

export const BLOCK_ELEMENT_DOCS = `
## Block Element (Sandboxed Component)

Renders TSX components from workbook/blocks/ in an isolated iframe.

### MDX Syntax

\`\`\`mdx
<!-- Completed block -->
<Block src="revenue-chart" />

<!-- With height (persists user resizing) -->
<Block src="top-customers" height={400} />

<!-- Block being created (shows shimmer) -->
<Block prompt="Create a revenue chart" editing />
\`\`\`

### Plate Element Type

\`\`\`typescript
interface TSandboxedBlockElement extends TElement {
  type: "sandboxed_block";
  src?: string;          // Block ID (maps to blocks/{src}.tsx)
  editing?: boolean;     // Creating mode (shimmer)
  prompt?: string;       // AI prompt for creation
  height?: number;       // Iframe height (user-resizable)
  linkedTables?: string[]; // Tables referenced by block
  buildError?: string;   // Compilation error
}
\`\`\`

### Features

- Lazy loading (loads when scrolled into view)
- Theme synchronization (light/dark mode)
- Auto-retry on load failure
- "Fix with AI" for render errors
- Resizable height (persisted to element)
`;

// ============================================================================
// MarkdownKit - Serialization
// ============================================================================

export const MARKDOWN_KIT_DOCS = `
## MarkdownKit - Serialization/Deserialization

The MarkdownKit plugin handles conversion between Plate elements and markdown/MDX text.

### Using the API

\`\`\`typescript
import { MarkdownPlugin } from "@platejs/markdown";

// Get API from editor
const api = editor.getApi(MarkdownPlugin);

// Serialize: Plate elements -> Markdown string
const markdown = api.markdown.serialize();

// Deserialize: Markdown string -> Plate elements
const nodes = api.markdown.deserialize(markdownText);
\`\`\`

### Remark Plugins

MarkdownKit uses:
- \`remark-gfm\` - GitHub Flavored Markdown (tables, strikethrough, etc.)
- \`remark-mdx\` - MDX JSX component support (<Block>, <LiveQuery>, etc.)

### Custom Serialization Rules

The following elements have custom MDX serialization:

| Plate Element | MDX Tag |
|---------------|---------|
| \`live_query\` | \`<LiveQuery query="..." />\` |
| \`live_query_inline\` | \`<LiveValue query="..." />\` |
| \`sandboxed_block\` | \`<Block src="..." />\` |
| \`fontColor\` mark | \`<span style="color: ...">\` |
| \`fontBackgroundColor\` mark | \`<span style="background-color: ...">\` |

### Saving a Document

\`\`\`typescript
import { serializeFrontmatter } from "@/components/page-editor/frontmatter";

function saveDocument(editor, frontmatter) {
  const api = editor.getApi(MarkdownPlugin);
  const markdown = api.markdown.serialize();
  const source = serializeFrontmatter(frontmatter) + markdown;
  // Save \`source\` to file
}
\`\`\`
`;

// ============================================================================
// Autoformat Rules
// ============================================================================

export const AUTOFORMAT_DOCS = `
## Autoformat - Typing Shortcuts

Instant markdown formatting as you type.

### Block Shortcuts (at line start)

| Type | Creates |
|------|---------|
| \`# \` | H1 heading |
| \`## \` | H2 heading |
| \`### \` | H3 heading |
| \`> \` | Blockquote |
| \`\`\`\`\`\` | Code block |
| \`+ \` | Toggle/collapsible |
| \`---\` | Horizontal rule |
| \`* \` or \`- \` | Bullet list |
| \`1. \` or \`1) \` | Numbered list |
| \`[] \` | Todo (unchecked) |
| \`[x] \` | Todo (checked) |

### Mark Shortcuts (wrap text)

| Type | Creates |
|------|---------|
| \`**text**\` | Bold |
| \`__text__\` | Underline |
| \`*text*\` or \`_text_\` | Italic |
| \`~~text~~\` | Strikethrough |
| \`^text^\` | Superscript |
| \`~text~\` | Subscript |
| \`\\\`text\\\`\` | Inline code / Ghost prompt |
| \`***text***\` | Bold + Italic |

### Smart Text (auto-replaced)

- Smart quotes: \`"text"\` -> curly quotes
- Dashes: \`--\` -> en-dash, \`---\` -> em-dash
- Arrows: \`->\`, \`<-\`, \`=>\`
- Symbols: \`(c)\`, \`(r)\`, \`(tm)\`
- Math: \`+-\`, \`!=\`, \`>=\`, \`<=\`
`;

// ============================================================================
// Complete Guide Export
// ============================================================================

export const MARKDOWN_GRAMMAR_GUIDE = `
# Hands Markdown Grammar Guide

Complete reference for the page editor's markdown/MDX syntax.

${MARKDOWN_SYNTAX}

${FRONTMATTER_DOCS}

${LIVEQUERY_DOCS}

${LIVEVALUE_DOCS}

${BLOCK_ELEMENT_DOCS}

${MARKDOWN_KIT_DOCS}

${AUTOFORMAT_DOCS}

## Quick Reference

### Creating Elements Programmatically

\`\`\`typescript
// LiveQuery (block)
import { createLiveQueryElement, createTableQuery } from "@/components/page-editor/plugins/live-query-kit";

// LiveValue (inline)
import { createInlineLiveQueryElement } from "@/components/page-editor/plugins/live-query-kit";

// Insert into editor
editor.tf.insertNodes(element);
\`\`\`

### Serialization Pipeline

\`\`\`
[Plate Elements] <-> [MarkdownKit] <-> [MDX/Markdown Text]
                          |
                    remark-gfm + remark-mdx
\`\`\`

### File Structure

\`\`\`
page.mdx
├── ---            # YAML frontmatter
│   title: ...
│   ---
├── # Heading      # Standard markdown
├── <Block ... />  # MDX components
├── <LiveQuery>    # Data queries
└── <LiveValue>    # Inline values
\`\`\`
`;
