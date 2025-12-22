/**
 * Hands App Architecture Guide
 *
 * Core philosophy: Build apps in Markdown using observable MDX grammar.
 * Keep this tight - it goes in system prompts.
 */

export const HANDS_ARCHITECTURE = `
## Hands Architecture: Apps in Markdown

Hands is a framework for building data apps using **observable MDX** - markdown with live SQL bindings.

\`\`\`
workbook/
├── pages/           # MDX apps (primary output)
│   └── blocks/      # Embeddable MDX fragments
├── plugins/         # Custom TSX components (charts, complex UI)
├── lib/             # Shared utilities
└── sources/         # Data connectors (API sync)
\`\`\`

### Core Concept: Observable MDX

Pages are **living documents** where data flows from SQL into the UI automatically:

\`\`\`mdx
---
title: Customer Dashboard
---

# Customers

We have <LiveValue query="SELECT COUNT(*) FROM customers" display="inline" /> total customers.

## Top Customers
<LiveValue query="SELECT name, revenue FROM customers ORDER BY revenue DESC LIMIT 10" display="table" />

## Add Customer
<LiveAction sql="INSERT INTO customers (name, email) VALUES ({{name}}, {{email}})">
  <Input name="name" placeholder="Customer name" />
  <Input name="email" type="email" placeholder="Email" />
  <Button>Add Customer</Button>
</LiveAction>
\`\`\`

This single MDX file is a complete CRUD app - no React code needed.

### Observable Grammar

#### LiveValue - Read Data (SELECT)

Display SQL results inline, as lists, or tables. Auto-refreshes when data changes.

| Data Shape | Display | Example |
|------------|---------|---------|
| Single value | \`inline\` | \`<LiveValue query="SELECT COUNT(*)" display="inline" />\` |
| One column | \`list\` | \`<LiveValue query="SELECT name FROM users" display="list" />\` |
| Multiple columns | \`table\` | \`<LiveValue query="SELECT * FROM orders" display="table" />\` |
| Auto-detect | (default) | \`<LiveValue query="..." />\` picks best format |

#### LiveAction - Write Data (INSERT/UPDATE/DELETE)

Wrap form controls to collect user input and execute mutations:

\`\`\`mdx
<LiveAction sql="UPDATE tasks SET status = {{status}} WHERE id = 1">
  <Select name="status" options={[
    { value: "todo", label: "To Do" },
    { value: "done", label: "Done" }
  ]} />
  <Button>Update</Button>
</LiveAction>
\`\`\`

**Form Controls:**
- \`<Input name="field">\` - Text, email, number inputs
- \`<Select name="field" options={...}>\` - Dropdowns
- \`<Checkbox name="field">\` - Boolean toggle
- \`<Textarea name="field">\` - Multi-line text
- \`<Button>\` - Submit button (triggers the SQL)

Values are bound using \`{{fieldName}}\` in the SQL.

#### Page - Embed MDX Fragments

Embed reusable MDX blocks from \`pages/blocks/\`:

\`\`\`mdx
<Page src="blocks/revenue-summary" />
\`\`\`

#### Plugins - Custom TSX Components

Only create plugins when MDX can't express what you need (charts, complex interactivity).
Plugins live in \`plugins/\` and are imported directly:

\`\`\`mdx
import RevenueChart from "../plugins/revenue-chart"

<RevenueChart period="6 months" />
\`\`\`

### Decision Guide: MDX First

| Need | Solution |
|------|----------|
| Show a count/metric | \`<LiveValue query="SELECT COUNT(*)" display="inline" />\` |
| Show a table | \`<LiveValue query="SELECT *..." display="table" />\` |
| Show a list | \`<LiveValue query="SELECT name..." display="list" />\` |
| Add/edit/delete data | \`<LiveAction>\` with form controls |
| Simple button action | \`<LiveAction sql="..."><Button>Do It</Button></LiveAction>\` |
| Dropdown filter → action | \`<Select>\` inside \`<LiveAction>\` |
| Reusable MDX fragment | \`<Page src="blocks/..." />\` |
| Interactive chart | Plugin in \`plugins/\` (delegate to @coder) |
| Complex custom UI | Plugin in \`plugins/\` (delegate to @coder) |

**90% of data apps can be built with LiveValue + LiveAction. Only use Plugins for truly custom visualizations.**

### Data Sources

**Sources** - Recurring API sync:
\`\`\`
sources action='add' name='stripe'
\`\`\`

**@import** - One-time file import:
\`\`\`
@import /path/to/data.csv
\`\`\`

### File Patterns

| Directory | Purpose | When to Create |
|-----------|---------|----------------|
| \`pages/\` | User-facing MDX apps | Always - this is the primary output |
| \`pages/blocks/\` | Embeddable MDX fragments | Reusable MDX sections |
| \`plugins/\` | Custom TSX components | Only when MDX can't express it |
| \`lib/\` | Shared utilities | For reusable code |
| \`sources/\` | API data connectors | When syncing external data |
`;
