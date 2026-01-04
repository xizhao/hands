/**
 * Markdown Grammar Guide for Hands Pages
 *
 * Documents all markdown syntax, MDX extensions, and Plate serialization.
 * Keep this concise - it goes in system prompts.
 */

// Import stdlib documentation from @hands/core (single source of truth)
import { STDLIB_COMPONENTS, STDLIB_DOCS, STDLIB_QUICK_REF } from "@hands/core/docs";

// Re-export for consumers
export { STDLIB_DOCS, STDLIB_QUICK_REF, STDLIB_COMPONENTS };

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
// LiveValue - Unified Data Display Element (Read-only SQL queries)
// ============================================================================

export const LIVEVALUE_DOCS = `
## LiveValue Element

Unified element for displaying SQL query results. Auto-selects minimal display based on data shape, or use explicit \`display\` prop.

### Display Modes

| Data Shape | Display | Description |
|------------|---------|-------------|
| 1×1 (single value) | \`inline\` | Styled text within paragraph |
| N×1 (single column) | \`list\` | Bullet list |
| N×M (multiple columns) | \`table\` | HTML table |

### MDX Syntax

\`\`\`mdx
<!-- Auto-select display based on data shape (recommended) -->
<LiveValue query="SELECT COUNT(*) FROM orders" />

<!-- Explicit inline display (for single values in text) -->
We have <LiveValue query="SELECT COUNT(*) FROM orders" display="inline" /> orders.

<!-- Explicit list display -->
<LiveValue query="SELECT name FROM users" display="list" />

<!-- Explicit table display -->
<LiveValue query="SELECT * FROM customers" display="table" />

<!-- Template mode: custom rendering with bindings -->
<LiveValue query="SELECT name, revenue FROM top_customers LIMIT 5">
## {{name}}
Revenue: **\${{revenue}}**
</LiveValue>
\`\`\`

### Template Bindings

Use \`{{field}}\` syntax inside LiveValue children:
- \`{{fieldName}}\` - exact column match
- \`{{value}}\` or \`{{name}}\` - fallback to first column
- \`{{_index}}\` - current row number (1-indexed)

### Plate Element Type

\`\`\`typescript
interface TLiveValueElement extends TElement {
  type: "live_value";
  query: string;                    // SQL query
  display?: "auto" | "inline" | "list" | "table";
  params?: Record<string, unknown>; // Named parameters
  columns?: ColumnConfig[] | "auto"; // For table mode
  className?: string;               // CSS class
  children: (TElement | TText)[];   // Template content
}
\`\`\`

### Creating LiveValue Elements

\`\`\`typescript
import { createLiveValueElement } from "@/components/page-editor/plugins/live-query-kit";

// Auto-display (recommended - selects based on data shape)
const element = createLiveValueElement("SELECT * FROM users");

// Explicit inline
const inline = createLiveValueElement("SELECT COUNT(*) FROM users", {
  display: "inline",
});

// Explicit table
const table = createLiveValueElement("SELECT * FROM users", {
  display: "table",
  columns: "auto",
});

// Template mode
const templated = createLiveValueElement("SELECT name FROM users", {
  children: [{ type: "p", children: [{ text: "User: {{name}}" }] }],
});
\`\`\`
`;

// Alias for backward compatibility (LIVEQUERY_DOCS was the old name)
export const LIVEQUERY_DOCS = LIVEVALUE_DOCS;

// ============================================================================
// LiveAction - Interactive Write Operations
// ============================================================================

export const LIVEACTION_DOCS = `
## LiveAction (Block Element)

Wraps interactive content that triggers SQL write operations. Children can call \`useLiveAction().trigger()\` to execute the action.

### MDX Syntax

\`\`\`mdx
<!-- Simple counter increment -->
<LiveAction sql="UPDATE counters SET value = value + 1 WHERE id = 1">

Click to increment: <LiveValue query="SELECT value FROM counters WHERE id = 1" />

<button>+1</button>

</LiveAction>

<!-- With parameters -->
<LiveAction sql="INSERT INTO clicks (user_id, timestamp) VALUES (1, datetime('now'))">

<button>Log Click</button>

</LiveAction>
\`\`\`

### How It Works

1. **Provider Pattern**: LiveAction wraps children and provides a React context
2. **Children call trigger()**: Any child component can call \`useLiveAction().trigger()\` on click/submit/etc.
3. **Auto-refresh**: After the write, LiveValue nodes automatically refetch via SSE subscription
4. **Error handling**: Failures show a toast notification via sonner

### Using the Hook

\`\`\`typescript
import { useLiveAction } from "@/components/page-editor/plugins/live-query-kit";

function ActionButton({ children }) {
  const { trigger, isPending, error } = useLiveAction();

  return (
    <button onClick={trigger} disabled={isPending}>
      {isPending ? "Loading..." : children}
    </button>
  );
}
\`\`\`

### Context Value

\`\`\`typescript
interface LiveActionContextValue {
  trigger: () => Promise<void>;  // Execute the SQL
  isPending: boolean;            // Loading state
  error: Error | null;           // Last error
}
\`\`\`

### Plate Element Type

\`\`\`typescript
interface TLiveActionElement extends TElement {
  type: "live_action";
  sql?: string;                   // SQL statement (UPDATE/INSERT/DELETE)
  src?: string;                   // Alternative: action ID reference
  params?: Record<string, unknown>; // Named parameters
  children: (TElement | TText)[]; // Interactive content
}
\`\`\`

### Creating LiveAction Elements

\`\`\`typescript
import { createLiveActionElement } from "@/components/page-editor/plugins/live-query-kit";

const element = createLiveActionElement(
  { sql: "UPDATE counters SET value = value + 1 WHERE id = 1" },
  [{ type: "p", children: [{ text: "Click me!" }] }]
);
\`\`\`

### Features

- **Loading overlay**: Shows spinner during execution
- **Toast notifications**: Errors displayed via sonner
- **SSE auto-refresh**: LiveValue nodes inside automatically update after write
- **Non-void element**: Children are editable in the editor

## Button Element

Built-in button that auto-wires \`trigger()\` from LiveAction context. Use inside LiveAction for automatic click handling.

### MDX Syntax

\`\`\`mdx
<LiveAction sql="UPDATE counters SET value = value + 1 WHERE id = 1">
  <Button>+1</Button>
</LiveAction>

<!-- With variant styling -->
<LiveAction sql="DELETE FROM items WHERE id = 1">
  <Button variant="destructive">Delete</Button>
</LiveAction>

<!-- Combining with LiveValue -->
<LiveAction sql="UPDATE counters SET value = value + 1 WHERE id = 1">
  <Button>
    Count: <LiveValue query="SELECT value FROM counters WHERE id = 1" display="inline" />
  </Button>
</LiveAction>
\`\`\`

### Variants

| Variant | Style | Use Case |
|---------|-------|----------|
| \`default\` | Primary blue | Default action |
| \`outline\` | Border only | Secondary action |
| \`ghost\` | Text only | Subtle action |
| \`destructive\` | Red | Delete/remove actions |

### Plate Element Type

\`\`\`typescript
interface TButtonElement extends TElement {
  type: "button";
  variant?: "default" | "outline" | "ghost" | "destructive";
  children: (TElement | TText)[]; // Button content
}
\`\`\`

### Behavior

- **Auto-trigger**: Calls \`useLiveAction().trigger()\` on click
- **Loading state**: Shows spinner and disables during execution
- **Error handling**: Falls back to toast if not inside LiveAction
- **Non-void element**: Children are editable (text, LiveValue, etc.)
`;

// ============================================================================
// Form Controls - Interactive Form Elements
// ============================================================================

export const FORM_CONTROLS_DOCS = `
## Form Controls

Form controls let you build interactive forms inside LiveAction. Values are captured and substituted into the SQL using \`{{fieldName}}\` bindings.

### How Form Binding Works

1. Form controls register with their parent LiveAction by \`name\`
2. SQL uses \`{{name}}\` template syntax for substitution
3. When Button is clicked, all field values are collected
4. \`{{fieldName}}\` placeholders are replaced with escaped values
5. Substituted SQL is executed

### MDX Syntax

Form controls are **non-void elements** - their children are the label text. This makes labels editable in the editor.

\`\`\`mdx
<!-- Simple form with text inputs (children = label) -->
<LiveAction sql="INSERT INTO contacts (name, email) VALUES ({{name}}, {{email}})">
  <Input name="name" placeholder="Full Name" required>Full Name</Input>
  <Input name="email" type="email" placeholder="Email Address">Email</Input>
  <Button>Add Contact</Button>
</LiveAction>

<!-- Form with dropdown selection -->
<LiveAction sql="UPDATE tasks SET status = {{status}} WHERE id = 1">
  <Select
    name="status"
    options={[
      { value: "pending", label: "Pending" },
      { value: "in_progress", label: "In Progress" },
      { value: "done", label: "Done" }
    ]}
  >Status</Select>
  <Button>Update Status</Button>
</LiveAction>

<!-- Form with checkbox -->
<LiveAction sql="UPDATE users SET newsletter = {{subscribe}} WHERE id = 1">
  <Checkbox name="subscribe">Subscribe to newsletter</Checkbox>
  <Button>Save Preferences</Button>
</LiveAction>

<!-- Form with textarea -->
<LiveAction sql="INSERT INTO notes (content, created_at) VALUES ({{content}}, datetime('now'))">
  <Textarea name="content" placeholder="Write your note..." rows={4}>Note Content</Textarea>
  <Button>Save Note</Button>
</LiveAction>
\`\`\`

### Input Element

Text input for single-line values. Block element with editable label as children.

| Prop | Type | Description |
|------|------|-------------|
| \`name\` | string | **Required.** Field name for {{name}} binding |
| \`type\` | string | Input type: text, email, number, password, tel, url |
| \`placeholder\` | string | Placeholder text |
| \`defaultValue\` | string | Initial value |
| \`required\` | boolean | Mark as required |
| \`pattern\` | string | Validation regex pattern |
| \`min\` | number | Min value (for number inputs) |
| \`max\` | number | Max value (for number inputs) |
| \`step\` | number | Step increment (for number inputs) |
| **children** | nodes | Label text (editable in editor) |

\`\`\`typescript
interface TInputElement extends TElement {
  type: "input";
  name: string;
  inputType?: "text" | "email" | "number" | "password" | "tel" | "url";
  placeholder?: string;
  defaultValue?: string;
  required?: boolean;
  pattern?: string;
  min?: number | string;
  max?: number | string;
  step?: number;
  children: (TElement | TText)[]; // Label text
}
\`\`\`

### Select Element

Dropdown select for choosing from options. Block element with editable label as children.

| Prop | Type | Description |
|------|------|-------------|
| \`name\` | string | **Required.** Field name for {{name}} binding |
| \`options\` | array | **Required.** Array of { value, label } objects |
| \`placeholder\` | string | Placeholder text when no selection |
| \`defaultValue\` | string | Initially selected value |
| \`required\` | boolean | Mark as required |
| **children** | nodes | Label text (editable in editor) |

\`\`\`typescript
interface TSelectElement extends TElement {
  type: "select";
  name: string;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
  defaultValue?: string;
  required?: boolean;
  children: (TElement | TText)[]; // Label text
}
\`\`\`

### Checkbox Element

Checkbox for boolean values. Block element with editable label as children. Returns TRUE/FALSE in SQL.

| Prop | Type | Description |
|------|------|-------------|
| \`name\` | string | **Required.** Field name for {{name}} binding |
| \`defaultChecked\` | boolean | Initial checked state |
| **children** | nodes | Label text (editable in editor) |

\`\`\`typescript
interface TCheckboxElement extends TElement {
  type: "checkbox";
  name: string;
  defaultChecked?: boolean;
  children: (TElement | TText)[]; // Label text
}
\`\`\`

### Textarea Element

Multi-line text input. Block element with editable label as children.

| Prop | Type | Description |
|------|------|-------------|
| \`name\` | string | **Required.** Field name for {{name}} binding |
| \`placeholder\` | string | Placeholder text |
| \`defaultValue\` | string | Initial value |
| \`rows\` | number | Visible rows (default: 3) |
| \`required\` | boolean | Mark as required |
| **children** | nodes | Label text (editable in editor) |

\`\`\`typescript
interface TTextareaElement extends TElement {
  type: "textarea";
  name: string;
  placeholder?: string;
  defaultValue?: string;
  rows?: number;
  required?: boolean;
  children: (TElement | TText)[]; // Label text
}
\`\`\`

### Value Substitution Rules

When \`trigger()\` is called, values are substituted as follows:

| Value Type | SQL Output |
|------------|------------|
| Empty/null/undefined | \`NULL\` |
| Boolean true | \`TRUE\` |
| Boolean false | \`FALSE\` |
| Number | Number as-is (e.g., \`42\`) |
| String | Escaped string (e.g., \`'O''Brien'\`) |

### Creating Form Control Elements

\`\`\`typescript
import {
  createInputElement,
  createSelectElement,
  createCheckboxElement,
  createTextareaElement,
} from "@/components/page-editor/plugins/live-query-kit";

// Text input
const nameInput = createInputElement("name", {
  placeholder: "Enter your name",
  required: true,
});

// Email input
const emailInput = createInputElement("email", {
  inputType: "email",
  placeholder: "Enter email",
});

// Number input
const ageInput = createInputElement("age", {
  inputType: "number",
  min: 0,
  max: 120,
});

// Select dropdown
const statusSelect = createSelectElement("status", [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
]);

// Checkbox
const subscribeCheckbox = createCheckboxElement("subscribe", {
  label: "Subscribe to updates",
  defaultChecked: true,
});

// Textarea
const notesTextarea = createTextareaElement("notes", {
  placeholder: "Additional notes...",
  rows: 4,
});
\`\`\`

### Complete Form Example

\`\`\`mdx
## Add New Customer

<LiveAction sql="INSERT INTO customers (name, email, tier, notes) VALUES ({{name}}, {{email}}, {{tier}}, {{notes}})">

**Customer Details**

<Input name="name" placeholder="Full name" required>Name</Input>

<Input name="email" type="email" placeholder="email@example.com">Email</Input>

<Select
  name="tier"
  options={[
    { value: "free", label: "Free" },
    { value: "pro", label: "Pro" },
    { value: "enterprise", label: "Enterprise" }
  ]}
  defaultValue="free"
>Tier</Select>

<Textarea name="notes" placeholder="Optional notes..." rows={3}>Notes</Textarea>

<Button>Create Customer</Button>

</LiveAction>
\`\`\`
`;

// ============================================================================
// Card Layout Components
// ============================================================================

export const CARD_DOCS = `
## Card Layout Components

Cards are layout containers for grouping related content with visual styling (borders, shadows).

### MDX Syntax

\`\`\`mdx
<Card>
  <CardHeader>
    <CardTitle>Dashboard Stats</CardTitle>
    <CardDescription>Overview of key metrics</CardDescription>
  </CardHeader>
  <CardContent>
    Total Users: <LiveValue query="SELECT COUNT(*) FROM users" display="inline" />
  </CardContent>
  <CardFooter>
    <Button>View All</Button>
  </CardFooter>
</Card>
\`\`\`

### Components

| Component | Description |
|-----------|-------------|
| \`<Card>\` | Container with border, shadow, rounded corners |
| \`<CardHeader>\` | Header section with padding |
| \`<CardTitle>\` | Semibold title text |
| \`<CardDescription>\` | Muted description text |
| \`<CardContent>\` | Main content area with padding |
| \`<CardFooter>\` | Footer section with padding |

### Usage Patterns

**Stats Card:**
\`\`\`mdx
<Card>
  <CardHeader>
    <CardTitle>Revenue</CardTitle>
  </CardHeader>
  <CardContent>
    <h1><LiveValue query="SELECT SUM(amount) FROM orders" display="inline" /></h1>
  </CardContent>
</Card>
\`\`\`

**Form Card:**
\`\`\`mdx
<Card>
  <CardHeader>
    <CardTitle>Add Contact</CardTitle>
    <CardDescription>Fill in the details below</CardDescription>
  </CardHeader>
  <CardContent>
    <LiveAction sql="INSERT INTO contacts (name, email) VALUES ({{name}}, {{email}})">
      <Input name="name" placeholder="Name">Name</Input>
      <Input name="email" type="email" placeholder="Email">Email</Input>
      <Button>Submit</Button>
    </LiveAction>
  </CardContent>
</Card>
\`\`\`

**Multiple Cards (Dashboard):**
\`\`\`mdx
<Card>
  <CardHeader><CardTitle>Users</CardTitle></CardHeader>
  <CardContent><LiveValue query="SELECT COUNT(*) FROM users" display="inline" /></CardContent>
</Card>

<Card>
  <CardHeader><CardTitle>Orders</CardTitle></CardHeader>
  <CardContent><LiveValue query="SELECT COUNT(*) FROM orders" display="inline" /></CardContent>
</Card>
\`\`\`
`;

// ============================================================================
// All Supported Elements
// ============================================================================

export const ALL_ELEMENTS_DOCS = `
## All Supported Page Elements

Pages support standard markdown plus these special elements:

### Text Formatting (Marks)
- **Bold** (\`**text**\` or Cmd+B)
- *Italic* (\`*text*\` or Cmd+I)
- <u>Underline</u> (\`__text__\` or Cmd+U)
- ~~Strikethrough~~ (\`~~text~~\`)
- \`Inline code\` (\\\`code\\\`)
- ^Superscript^ (\`^text^\`)
- ~Subscript~ (\`~text~\`)
- Font color (\`<span style="color: red">text</span>\`)
- Background color (\`<span style="background-color: yellow">text</span>\`)

### Block Elements
| Element | Markdown | Description |
|---------|----------|-------------|
| Headings | \`# ## ###\` | H1, H2, H3 |
| Paragraph | (default) | Normal text |
| Blockquote | \`> text\` | Quoted text |
| Code Block | \`\`\`\`\`\`lang\` | Syntax-highlighted code |
| Horizontal Rule | \`---\` | Divider line |

### Lists
| Type | Markdown | Description |
|------|----------|-------------|
| Bulleted | \`- item\` or \`* item\` | Unordered list |
| Numbered | \`1. item\` | Ordered list |
| To-do | \`[] item\` or \`[x] item\` | Checkbox list |
| Toggle | \`+ item\` | Collapsible section |

### Tables (GFM)
\`\`\`markdown
| Header 1 | Header 2 | Header 3 |
|----------|----------|----------|
| Cell 1   | Cell 2   | Cell 3   |
| Cell 4   | Cell 5   | Cell 6   |
\`\`\`

Tables support:
- Column alignment (\`:---\`, \`:---:\`, \`---:\`)
- Header row styling
- Cell editing

### Callouts
\`\`\`markdown
:::note
This is a callout with important information.
:::
\`\`\`

Callouts are highlighted boxes for tips, warnings, or important notes.

### MDX Components
| Component | Usage | Description |
|-----------|-------|-------------|
| \`<Block>\` | \`<Block src="chart" />\` | Embed TSX block |
| \`<LiveValue>\` | \`<LiveValue query="..." />\` | SQL query display (auto-selects inline/list/table) |
| \`<LiveAction>\` | \`<LiveAction sql="...">...</LiveAction>\` | Interactive write trigger |
| \`<Button>\` | \`<Button>Click</Button>\` | Button that auto-triggers LiveAction |
| \`<Input>\` | \`<Input name="field">Label</Input>\` | Text input for forms |
| \`<Select>\` | \`<Select name="field" options={...}>Label</Select>\` | Dropdown for forms |
| \`<Checkbox>\` | \`<Checkbox name="field">Label</Checkbox>\` | Checkbox for forms |
| \`<Textarea>\` | \`<Textarea name="field">Label</Textarea>\` | Multi-line input for forms |
| \`<Card>\` | \`<Card>...</Card>\` | Card container with shadow/border |
| \`<CardHeader>\` | \`<CardHeader>...</CardHeader>\` | Card header section |
| \`<CardTitle>\` | \`<CardTitle>Title</CardTitle>\` | Card title |
| \`<CardDescription>\` | \`<CardDescription>...</CardDescription>\` | Card description |
| \`<CardContent>\` | \`<CardContent>...</CardContent>\` | Card content section |
| \`<CardFooter>\` | \`<CardFooter>...</CardFooter>\` | Card footer section |

### Inline Elements
- Links: \`[text](url)\`
- Emoji: Type \`:smile:\` or use emoji picker
- Mentions: \`@user\` or \`@block\`
- Equations: \`$x^2$\` (inline math)

### Special Features
- **Slash commands**: Type \`/\` to insert blocks
- **@ mentions**: Type \`@\` to reference blocks or data
- **Autoformat**: Markdown shortcuts auto-convert as you type
- **Drag & drop**: Reorder blocks by dragging
`;

// ============================================================================
// Page Element - Embedded MDX Blocks
// ============================================================================

export const PAGE_ELEMENT_DOCS = `
## Page Element (Embedded MDX Block)

Embeds reusable MDX content from pages/blocks/ into the current page.

### MDX Syntax

\`\`\`mdx
<!-- Embed a reusable block from pages/blocks/ -->
<Page src="blocks/revenue-summary" />

<!-- With parameters -->
<Page src="blocks/customer-card" params={{userId: 123}} />
\`\`\`

### Plate Element Type

\`\`\`typescript
interface TPageEmbedElement extends TElement {
  type: "page_embed";
  src: string;           // Block path (e.g., "blocks/revenue-summary")
  params?: Record<string, unknown>; // Parameters passed to the block
}
\`\`\`

### Features

- Embeds MDX content from pages/blocks/
- Supports parameter passing
- Live updates when source block changes
- Inherits parent page styling

### Directory Structure

\`\`\`
pages/
  index.mdx           # Main page
  dashboard.mdx       # Another page
  blocks/             # Embeddable MDX fragments
    revenue-summary.mdx
    customer-card.mdx
\`\`\`
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
- \`remark-mdx\` - MDX JSX component support (<Block>, <LiveValue>, etc.)

### Custom Serialization Rules

The following elements have custom MDX serialization:

| Plate Element | MDX Tag |
|---------------|---------|
| \`live_value\` | \`<LiveValue query="..." display="..." />\` |
| \`live_action\` | \`<LiveAction sql="...">...</LiveAction>\` |
| \`button\` | \`<Button variant="...">...</Button>\` |
| \`input\` | \`<Input name="...">Label</Input>\` |
| \`select\` | \`<Select name="..." options={...}>Label</Select>\` |
| \`checkbox\` | \`<Checkbox name="...">Label</Checkbox>\` |
| \`textarea\` | \`<Textarea name="...">Label</Textarea>\` |
| \`card\` | \`<Card>...</Card>\` |
| \`card_header\` | \`<CardHeader>...</CardHeader>\` |
| \`card_title\` | \`<CardTitle>...</CardTitle>\` |
| \`card_description\` | \`<CardDescription>...</CardDescription>\` |
| \`card_content\` | \`<CardContent>...</CardContent>\` |
| \`card_footer\` | \`<CardFooter>...</CardFooter>\` |
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

${ALL_ELEMENTS_DOCS}

${LIVEVALUE_DOCS}

${LIVEACTION_DOCS}

${FORM_CONTROLS_DOCS}

${CARD_DOCS}

${PAGE_ELEMENT_DOCS}

${MARKDOWN_KIT_DOCS}

${AUTOFORMAT_DOCS}

## Quick Reference

### Creating Elements Programmatically

\`\`\`typescript
import { createLiveValueElement } from "@/components/page-editor/plugins/live-query-kit";

// Auto-select display based on data shape
const auto = createLiveValueElement("SELECT * FROM users");

// Explicit display mode
const inline = createLiveValueElement("SELECT COUNT(*) FROM users", { display: "inline" });
const list = createLiveValueElement("SELECT name FROM users", { display: "list" });
const table = createLiveValueElement("SELECT * FROM users", { display: "table" });

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
└── <LiveValue>    # Data queries (inline/list/table)
\`\`\`
`;
