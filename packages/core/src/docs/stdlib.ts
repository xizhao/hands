/**
 * Stdlib Documentation - Auto-generated
 *
 * DO NOT EDIT - Run: bun run generate:docs
 */

// Full documentation as markdown (for system prompts)
export const STDLIB_DOCS = "# Hands Standard Library\n\nComponent reference for the Hands data application framework.\n\n## Overview\n\nThe stdlib provides two categories of components:\n\n- **Static** - Display-only components that render data\n- **Active** - Interactive components that handle user input and execute SQL mutations\n\n---\n\n## Static Components\n\nDisplay-only components that render live data from SQL queries.\n\n### Loader\n\nAnimated loading indicator with multiple visual styles. Supports spinner, dots, bars, pulse, ring, bounce, wave, and square variants.\n\n**Keywords:** loader, loading, spinner, dots, progress, animation, wait\n\n**Example:**\n```tsx\n<Loader />\n<Loader variant=\"dots\" size=\"lg\" />\n<Loader variant=\"bars\" color=\"primary\" label=\"Loading...\" />\n```\n\n### Progress\n\nProgress bar for displaying completion status or loading states. Supports determinate (with value) and indeterminate (loading) modes.\n\n**Keywords:** progress, bar, loading, percentage, completion, status\n\n**Example:**\n```tsx\n<Progress value={75} />\n<Progress value={45} label=\"Upload Progress\" showValue />\n<Progress indeterminate />\n```\n\n### LiveValue\n\nDisplays live SQL query results. Auto-selects display format based on data shape: inline (1×1), list (N×1), or table (N×M). Supports template mode with {{field}} bindings.\n\n**Keywords:** sql, query, data, display, table, list, inline, live, reactive\n\n**Example:**\n```tsx\n<LiveValue sql=\"SELECT count(*) FROM users\" />\n<LiveValue sql=\"SELECT name FROM users\" display=\"list\" />\n<LiveValue sql=\"SELECT * FROM tasks WHERE status = 'active'\" display=\"table\" />\n```\n\n### AreaChart\n\nArea chart for visualizing trends with filled regions. Supports stacking for comparing cumulative values.\n\n**Keywords:** chart, area, filled, trend, cumulative, visualization\n\n**Example:**\n```tsx\n<AreaChart data={data} xKey=\"date\" yKey=\"pageviews\" />\n<AreaChart data={data} xKey=\"month\" yKey={[\"revenue\", \"costs\"]} stacked />\n```\n\n### BarChart\n\nBar chart for comparing categorical data. Supports vertical/horizontal orientation and stacked bars.\n\n**Keywords:** chart, bar, column, comparison, category, visualization\n\n**Example:**\n```tsx\n<BarChart data={data} xKey=\"category\" yKey=\"value\" />\n<BarChart data={data} xKey=\"month\" yKey={[\"sales\", \"costs\"]} stacked />\n```\n\n### PieChart\n\nPie/donut chart for showing proportional data. Set innerRadius > 0 to create a donut chart.\n\n**Keywords:** chart, pie, donut, proportion, percentage, visualization\n\n**Example:**\n```tsx\n<PieChart data={data} valueKey=\"count\" nameKey=\"category\" />\n<PieChart data={data} valueKey=\"amount\" nameKey=\"type\" innerRadius={60} />\n```\n\n### LineChart\n\nLine chart for visualizing trends over time or continuous data. Works standalone or inside LiveValue for live SQL data.\n\n**Keywords:** chart, line, graph, trend, time series, visualization\n\n**Example:**\n```tsx\n<LineChart data={data} xKey=\"date\" yKey=\"revenue\" />\n<LineChart data={data} xKey=\"month\" yKey={[\"sales\", \"expenses\"]} showLegend />\n```\n\n### Metric\n\nKPI display for showing a single metric value with optional label and change indicator. Perfect for dashboards showing counts, percentages, or any key performance indicator.\n\n**Keywords:** metric, kpi, number, stat, dashboard, counter, value, indicator\n\n**Example:**\n```tsx\n<Metric label=\"Total Users\" value={1234} />\n<Metric label=\"Revenue\" value={50000} prefix=\"$\" change={12.5} />\n<Metric label=\"Error Rate\" value={0.5} suffix=\"%\" change={-8} changeLabel=\"vs last week\" />\n```\n\n### Alert\n\nCallout message box for displaying info, warnings, errors, or success messages. Use to highlight important information or feedback to users.\n\n**Keywords:** alert, callout, message, info, warning, error, success, notification\n\n**Example:**\n```tsx\n<Alert>This is an informational message.</Alert>\n<Alert variant=\"success\" title=\"Success!\">Your changes have been saved.</Alert>\n<Alert variant=\"warning\">Please review before continuing.</Alert>\n<Alert variant=\"destructive\" title=\"Error\">Something went wrong.</Alert>\n```\n\n### Badge\n\nInline status indicator for labeling items with semantic colors. Use for status indicators, tags, or category labels.\n\n**Keywords:** badge, tag, status, label, indicator, pill\n\n**Example:**\n```tsx\n<Badge>Active</Badge>\n<Badge variant=\"success\">Completed</Badge>\n<Badge variant=\"warning\">Pending</Badge>\n<Badge variant=\"destructive\">Failed</Badge>\n```\n\n### DataGrid\n\nHigh-performance editable data grid with virtualization, keyboard navigation, and comprehensive cell editing. Supports sorting, searching, and clipboard operations.\n\n**Keywords:** grid, table, data, spreadsheet, edit, sort, filter, virtual\n\n**Example:**\n```tsx\n<DataGrid data={data} />\n<DataGrid data={data} height={400} readOnly />\n<DataGrid data={data} columns={[{key: \"name\", label: \"Name\"}, {key: \"email\", label: \"Email\"}]} />\n```\n\n\n---\n\n## Active Components\n\nInteractive components for building forms that execute SQL mutations.\n\n### LiveAction\n\nContainer that wraps form controls and executes SQL mutations on submit. Children can use {{fieldName}} bindings in the SQL that get replaced with form values.\n\n**Keywords:** form, action, mutation, sql, update, insert, delete, submit\n\n**Example:**\n```tsx\n<LiveAction sql=\"UPDATE tasks SET status = {{status}} WHERE id = 1\">\n  <ActionSelect name=\"status\" options={[{value: \"done\", label: \"Done\"}]} />\n  <ActionButton>Update</ActionButton>\n</LiveAction>\n```\n\n### Kanban\n\nDrag-and-drop Kanban board that displays SQL query results grouped by a column. Cards can be dragged between columns to update the underlying data.\n\n**Keywords:** kanban, board, drag, drop, cards, columns, status, workflow, tasks\n\n**Example:**\n```tsx\n<Kanban\n  query=\"SELECT id, title, status FROM tasks\"\n  groupByColumn=\"status\"\n  cardTitleField=\"title\"\n  updateSql=\"UPDATE tasks SET status = {{status}} WHERE id = {{id}}\"\n/>\n```\n\n### ActionButton\n\nButton that triggers the parent LiveAction's SQL execution on click. Must be used inside a LiveAction container.\n\n**Keywords:** button, submit, action, trigger, form\n\n**Example:**\n```tsx\n<LiveAction sql=\"UPDATE tasks SET done = true WHERE id = 1\">\n  <ActionButton>Mark Complete</ActionButton>\n</LiveAction>\n```\n\n### ActionCheckbox\n\nCheckbox that registers its value with parent LiveAction for SQL binding. The `name` prop determines the {{name}} placeholder in SQL (returns true/false).\n\n**Keywords:** checkbox, boolean, toggle, form, field, binding\n\n**Example:**\n```tsx\n<LiveAction sql=\"UPDATE tasks SET done = {{done}} WHERE id = 1\">\n  <ActionCheckbox name=\"done\">Mark as complete</ActionCheckbox>\n  <ActionButton>Save</ActionButton>\n</LiveAction>\n```\n\n### ActionSelect\n\nDropdown select that registers its value with parent LiveAction for SQL binding. The `name` prop determines the {{name}} placeholder in SQL.\n\n**Keywords:** select, dropdown, form, field, binding, options\n\n**Example:**\n```tsx\n<LiveAction sql=\"UPDATE tasks SET status = {{status}} WHERE id = 1\">\n  <ActionSelect\n    name=\"status\"\n    options={[\n      { value: \"pending\", label: \"Pending\" },\n      { value: \"done\", label: \"Done\" }\n    ]}\n  />\n  <ActionButton>Update</ActionButton>\n</LiveAction>\n```\n\n### ActionTextarea\n\nMultiline text input that registers its value with parent LiveAction for SQL binding. The `name` prop determines the {{name}} placeholder in SQL.\n\n**Keywords:** textarea, multiline, text, form, field, binding\n\n**Example:**\n```tsx\n<LiveAction sql=\"UPDATE posts SET content = {{content}} WHERE id = 1\">\n  <ActionTextarea name=\"content\" placeholder=\"Enter content...\" rows={5} />\n  <ActionButton>Save</ActionButton>\n</LiveAction>\n```\n\n### ActionInput\n\nText input that registers its value with parent LiveAction for SQL binding. The `name` prop determines the {{name}} placeholder in SQL.\n\n**Keywords:** input, text, form, field, binding\n\n**Example:**\n```tsx\n<LiveAction sql=\"UPDATE users SET name = {{name}} WHERE id = 1\">\n  <ActionInput name=\"name\" placeholder=\"Enter name\" />\n  <ActionButton>Save</ActionButton>\n</LiveAction>\n```\n\n";

// Component metadata
export const STDLIB_COMPONENTS = {
  "Loader": {
    "category": "static",
    "description": "Animated loading indicator with multiple visual styles. Supports spinner, dots, bars, pulse, ring, bounce, wave, and square variants.",
    "keywords": [
      "loader",
      "loading",
      "spinner",
      "dots",
      "progress",
      "animation",
      "wait"
    ],
    "example": "<Loader />\n<Loader variant=\"dots\" size=\"lg\" />\n<Loader variant=\"bars\" color=\"primary\" label=\"Loading...\" />"
  },
  "Progress": {
    "category": "static",
    "description": "Progress bar for displaying completion status or loading states. Supports determinate (with value) and indeterminate (loading) modes.",
    "keywords": [
      "progress",
      "bar",
      "loading",
      "percentage",
      "completion",
      "status"
    ],
    "example": "<Progress value={75} />\n<Progress value={45} label=\"Upload Progress\" showValue />\n<Progress indeterminate />"
  },
  "LiveValue": {
    "category": "static",
    "description": "Displays live SQL query results. Auto-selects display format based on data shape: inline (1×1), list (N×1), or table (N×M). Supports template mode with {{field}} bindings.",
    "keywords": [
      "sql",
      "query",
      "data",
      "display",
      "table",
      "list",
      "inline",
      "live",
      "reactive"
    ],
    "example": "<LiveValue sql=\"SELECT count(*) FROM users\" />\n<LiveValue sql=\"SELECT name FROM users\" display=\"list\" />\n<LiveValue sql=\"SELECT * FROM tasks WHERE status = 'active'\" display=\"table\" />"
  },
  "AreaChart": {
    "category": "static",
    "description": "Area chart for visualizing trends with filled regions. Supports stacking for comparing cumulative values.",
    "keywords": [
      "chart",
      "area",
      "filled",
      "trend",
      "cumulative",
      "visualization"
    ],
    "example": "<AreaChart data={data} xKey=\"date\" yKey=\"pageviews\" />\n<AreaChart data={data} xKey=\"month\" yKey={[\"revenue\", \"costs\"]} stacked />"
  },
  "BarChart": {
    "category": "static",
    "description": "Bar chart for comparing categorical data. Supports vertical/horizontal orientation and stacked bars.",
    "keywords": [
      "chart",
      "bar",
      "column",
      "comparison",
      "category",
      "visualization"
    ],
    "example": "<BarChart data={data} xKey=\"category\" yKey=\"value\" />\n<BarChart data={data} xKey=\"month\" yKey={[\"sales\", \"costs\"]} stacked />"
  },
  "PieChart": {
    "category": "static",
    "description": "Pie/donut chart for showing proportional data. Set innerRadius > 0 to create a donut chart.",
    "keywords": [
      "chart",
      "pie",
      "donut",
      "proportion",
      "percentage",
      "visualization"
    ],
    "example": "<PieChart data={data} valueKey=\"count\" nameKey=\"category\" />\n<PieChart data={data} valueKey=\"amount\" nameKey=\"type\" innerRadius={60} />"
  },
  "LineChart": {
    "category": "static",
    "description": "Line chart for visualizing trends over time or continuous data. Works standalone or inside LiveValue for live SQL data.",
    "keywords": [
      "chart",
      "line",
      "graph",
      "trend",
      "time series",
      "visualization"
    ],
    "example": "<LineChart data={data} xKey=\"date\" yKey=\"revenue\" />\n<LineChart data={data} xKey=\"month\" yKey={[\"sales\", \"expenses\"]} showLegend />"
  },
  "Metric": {
    "category": "static",
    "description": "KPI display for showing a single metric value with optional label and change indicator. Perfect for dashboards showing counts, percentages, or any key performance indicator.",
    "keywords": [
      "metric",
      "kpi",
      "number",
      "stat",
      "dashboard",
      "counter",
      "value",
      "indicator"
    ],
    "example": "<Metric label=\"Total Users\" value={1234} />\n<Metric label=\"Revenue\" value={50000} prefix=\"$\" change={12.5} />\n<Metric label=\"Error Rate\" value={0.5} suffix=\"%\" change={-8} changeLabel=\"vs last week\" />"
  },
  "Alert": {
    "category": "static",
    "description": "Callout message box for displaying info, warnings, errors, or success messages. Use to highlight important information or feedback to users.",
    "keywords": [
      "alert",
      "callout",
      "message",
      "info",
      "warning",
      "error",
      "success",
      "notification"
    ],
    "example": "<Alert>This is an informational message.</Alert>\n<Alert variant=\"success\" title=\"Success!\">Your changes have been saved.</Alert>\n<Alert variant=\"warning\">Please review before continuing.</Alert>\n<Alert variant=\"destructive\" title=\"Error\">Something went wrong.</Alert>"
  },
  "Badge": {
    "category": "static",
    "description": "Inline status indicator for labeling items with semantic colors. Use for status indicators, tags, or category labels.",
    "keywords": [
      "badge",
      "tag",
      "status",
      "label",
      "indicator",
      "pill"
    ],
    "example": "<Badge>Active</Badge>\n<Badge variant=\"success\">Completed</Badge>\n<Badge variant=\"warning\">Pending</Badge>\n<Badge variant=\"destructive\">Failed</Badge>"
  },
  "DataGrid": {
    "category": "static",
    "description": "High-performance editable data grid with virtualization, keyboard navigation, and comprehensive cell editing. Supports sorting, searching, and clipboard operations.",
    "keywords": [
      "grid",
      "table",
      "data",
      "spreadsheet",
      "edit",
      "sort",
      "filter",
      "virtual"
    ],
    "example": "<DataGrid data={data} />\n<DataGrid data={data} height={400} readOnly />\n<DataGrid data={data} columns={[{key: \"name\", label: \"Name\"}, {key: \"email\", label: \"Email\"}]} />"
  },
  "LiveAction": {
    "category": "active",
    "description": "Container that wraps form controls and executes SQL mutations on submit. Children can use {{fieldName}} bindings in the SQL that get replaced with form values.",
    "keywords": [
      "form",
      "action",
      "mutation",
      "sql",
      "update",
      "insert",
      "delete",
      "submit"
    ],
    "example": "<LiveAction sql=\"UPDATE tasks SET status = {{status}} WHERE id = 1\">\n  <ActionSelect name=\"status\" options={[{value: \"done\", label: \"Done\"}]} />\n  <ActionButton>Update</ActionButton>\n</LiveAction>"
  },
  "Kanban": {
    "category": "active",
    "description": "Drag-and-drop Kanban board that displays SQL query results grouped by a column. Cards can be dragged between columns to update the underlying data.",
    "keywords": [
      "kanban",
      "board",
      "drag",
      "drop",
      "cards",
      "columns",
      "status",
      "workflow",
      "tasks"
    ],
    "example": "<Kanban\n  query=\"SELECT id, title, status FROM tasks\"\n  groupByColumn=\"status\"\n  cardTitleField=\"title\"\n  updateSql=\"UPDATE tasks SET status = {{status}} WHERE id = {{id}}\"\n/>"
  },
  "ActionButton": {
    "category": "active",
    "description": "Button that triggers the parent LiveAction's SQL execution on click. Must be used inside a LiveAction container.",
    "keywords": [
      "button",
      "submit",
      "action",
      "trigger",
      "form"
    ],
    "example": "<LiveAction sql=\"UPDATE tasks SET done = true WHERE id = 1\">\n  <ActionButton>Mark Complete</ActionButton>\n</LiveAction>"
  },
  "ActionCheckbox": {
    "category": "active",
    "description": "Checkbox that registers its value with parent LiveAction for SQL binding. The `name` prop determines the {{name}} placeholder in SQL (returns true/false).",
    "keywords": [
      "checkbox",
      "boolean",
      "toggle",
      "form",
      "field",
      "binding"
    ],
    "example": "<LiveAction sql=\"UPDATE tasks SET done = {{done}} WHERE id = 1\">\n  <ActionCheckbox name=\"done\">Mark as complete</ActionCheckbox>\n  <ActionButton>Save</ActionButton>\n</LiveAction>"
  },
  "ActionSelect": {
    "category": "active",
    "description": "Dropdown select that registers its value with parent LiveAction for SQL binding. The `name` prop determines the {{name}} placeholder in SQL.",
    "keywords": [
      "select",
      "dropdown",
      "form",
      "field",
      "binding",
      "options"
    ],
    "example": "<LiveAction sql=\"UPDATE tasks SET status = {{status}} WHERE id = 1\">\n  <ActionSelect\n    name=\"status\"\n    options={[\n      { value: \"pending\", label: \"Pending\" },\n      { value: \"done\", label: \"Done\" }\n    ]}\n  />\n  <ActionButton>Update</ActionButton>\n</LiveAction>"
  },
  "ActionTextarea": {
    "category": "active",
    "description": "Multiline text input that registers its value with parent LiveAction for SQL binding. The `name` prop determines the {{name}} placeholder in SQL.",
    "keywords": [
      "textarea",
      "multiline",
      "text",
      "form",
      "field",
      "binding"
    ],
    "example": "<LiveAction sql=\"UPDATE posts SET content = {{content}} WHERE id = 1\">\n  <ActionTextarea name=\"content\" placeholder=\"Enter content...\" rows={5} />\n  <ActionButton>Save</ActionButton>\n</LiveAction>"
  },
  "ActionInput": {
    "category": "active",
    "description": "Text input that registers its value with parent LiveAction for SQL binding. The `name` prop determines the {{name}} placeholder in SQL.",
    "keywords": [
      "input",
      "text",
      "form",
      "field",
      "binding"
    ],
    "example": "<LiveAction sql=\"UPDATE users SET name = {{name}} WHERE id = 1\">\n  <ActionInput name=\"name\" placeholder=\"Enter name\" />\n  <ActionButton>Save</ActionButton>\n</LiveAction>"
  }
} as const;

// Component names by category
export const STATIC_COMPONENTS = ["Loader","Progress","LiveValue","AreaChart","BarChart","PieChart","LineChart","Metric","Alert","Badge","DataGrid"] as const;
export const ACTIVE_COMPONENTS = ["LiveAction","Kanban","ActionButton","ActionCheckbox","ActionSelect","ActionTextarea","ActionInput"] as const;

// All component names
export const ALL_COMPONENTS = [...STATIC_COMPONENTS, ...ACTIVE_COMPONENTS] as const;

// Quick reference for agents (shorter than full docs)
export const STDLIB_QUICK_REF = "\n## Stdlib Components\n\n### Static (Display)\n- **Loader**: Animated loading indicator with multiple visual styles. Supports spinner, dots, bars, pulse, ring, bounce, wave, and square variants.\n- **Progress**: Progress bar for displaying completion status or loading states. Supports determinate (with value) and indeterminate (loading) modes.\n- **LiveValue**: Displays live SQL query results. Auto-selects display format based on data shape: inline (1×1), list (N×1), or table (N×M). Supports template mode with {{field}} bindings.\n- **AreaChart**: Area chart for visualizing trends with filled regions. Supports stacking for comparing cumulative values.\n- **BarChart**: Bar chart for comparing categorical data. Supports vertical/horizontal orientation and stacked bars.\n- **PieChart**: Pie/donut chart for showing proportional data. Set innerRadius > 0 to create a donut chart.\n- **LineChart**: Line chart for visualizing trends over time or continuous data. Works standalone or inside LiveValue for live SQL data.\n- **Metric**: KPI display for showing a single metric value with optional label and change indicator. Perfect for dashboards showing counts, percentages, or any key performance indicator.\n- **Alert**: Callout message box for displaying info, warnings, errors, or success messages. Use to highlight important information or feedback to users.\n- **Badge**: Inline status indicator for labeling items with semantic colors. Use for status indicators, tags, or category labels.\n- **DataGrid**: High-performance editable data grid with virtualization, keyboard navigation, and comprehensive cell editing. Supports sorting, searching, and clipboard operations.\n\n### Active (Interactive)\n- **LiveAction**: Container that wraps form controls and executes SQL mutations on submit. Children can use {{fieldName}} bindings in the SQL that get replaced with form values.\n- **Kanban**: Drag-and-drop Kanban board that displays SQL query results grouped by a column. Cards can be dragged between columns to update the underlying data.\n- **ActionButton**: Button that triggers the parent LiveAction's SQL execution on click. Must be used inside a LiveAction container.\n- **ActionCheckbox**: Checkbox that registers its value with parent LiveAction for SQL binding. The `name` prop determines the {{name}} placeholder in SQL (returns true/false).\n- **ActionSelect**: Dropdown select that registers its value with parent LiveAction for SQL binding. The `name` prop determines the {{name}} placeholder in SQL.\n- **ActionTextarea**: Multiline text input that registers its value with parent LiveAction for SQL binding. The `name` prop determines the {{name}} placeholder in SQL.\n- **ActionInput**: Text input that registers its value with parent LiveAction for SQL binding. The `name` prop determines the {{name}} placeholder in SQL.\n";
