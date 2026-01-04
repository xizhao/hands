/**
 * Stdlib Documentation - Auto-generated
 *
 * DO NOT EDIT - Run: bun run generate:docs
 */

// Full documentation as markdown (for system prompts)
export const STDLIB_DOCS = "# Hands Standard Library\n\nComponent reference for the Hands data application framework.\n\n## Overview\n\nThe stdlib provides three categories of components:\n\n- **View** - Display-only components that render data\n- **Action** - Interactive components that trigger discrete actions\n- **Data** - Self-contained data management with CRUD operations\n\n---\n\n## View Components\n\nDisplay-only components that render live data from SQL queries.\n\n### InteractiveMap\n\nInteractive MapLibre GL map with pan/zoom, markers, and popups. Uses free CARTO basemap tiles (no API key required). Supports light/dark/voyager styles.\n\n**Keywords:** map, interactive, maplibre, markers, popups, pan, zoom, geolocation, location\n\n**Example:**\n```tsx\n<InteractiveMap longitude={-122.4} latitude={37.8} zoom={12} />\n<InteractiveMap longitude={-74.006} latitude={40.7128} zoom={10} mapStyle=\"dark\">\n  <MapMarker longitude={-74.006} latitude={40.7128} popup=\"New York City\" />\n  <MapControls />\n</InteractiveMap>\n```\n\n### Tabs\n\nTabbed navigation for organizing content into switchable panels. Use for dashboards, settings pages, or any content that benefits from tab navigation.\n\n**Keywords:** tabs, navigation, panels, switch, organize, sections\n\n**Example:**\n```tsx\n<Tabs defaultValue=\"overview\">\n  <Tab value=\"overview\" label=\"Overview\">Overview content here</Tab>\n  <Tab value=\"metrics\" label=\"Metrics\">Metrics and charts</Tab>\n  <Tab value=\"settings\" label=\"Settings\">Configuration options</Tab>\n</Tabs>\n```\n\n### Loader\n\nAnimated loading indicator with multiple visual styles. Supports spinner, dots, bars, pulse, ring, bounce, wave, and square variants.\n\n**Keywords:** loader, loading, spinner, dots, progress, animation, wait\n\n**Example:**\n```tsx\n<Loader />\n<Loader variant=\"dots\" size=\"lg\" />\n<Loader variant=\"bars\" color=\"primary\" label=\"Loading...\" />\n```\n\n### Progress\n\nProgress bar for displaying completion status or loading states. Supports determinate (with value) and indeterminate (loading) modes.\n\n**Keywords:** progress, bar, loading, percentage, completion, status\n\n**Example:**\n```tsx\n<Progress value={75} />\n<Progress value={45} label=\"Upload Progress\" showValue />\n<Progress indeterminate />\n```\n\n### LiveValue\n\nDisplays live SQL query results. Auto-selects display format based on data shape: inline (1×1), list (N×1), or table (N×M). Supports template mode with {{field}} bindings.\n\n**Keywords:** sql, query, data, display, table, list, inline, live, reactive\n\n**Example:**\n```tsx\n<LiveValue sql=\"SELECT count(*) FROM users\" />\n<LiveValue sql=\"SELECT name FROM users\" display=\"list\" />\n<LiveValue sql=\"SELECT * FROM tasks WHERE status = 'active'\" display=\"table\" />\n```\n\n### AreaChart\n\nArea chart for visualizing trends with filled regions. Supports stacking for comparing cumulative values. Works standalone or inside LiveValue for live SQL data. Supports animation: use animateBy=\"fieldName\" to animate through distinct values of that field.\n\n**Keywords:** chart, area, filled, trend, cumulative, visualization, animation\n\n**Example:**\n```tsx\n<AreaChart data={data} xKey=\"date\" yKey=\"pageviews\" />\n<AreaChart data={data} xKey=\"month\" yKey={[\"revenue\", \"costs\"]} stacked />\n<AreaChart data={data} xKey=\"date\" yKey=\"users\" animateBy=\"year\" />\n```\n\n### BarChart\n\nBar chart for comparing categorical data. Supports vertical/horizontal orientation and stacked bars. Works standalone or inside LiveValue for live SQL data. Supports animation: use animateBy=\"fieldName\" to animate through distinct values of that field (e.g., animateBy=\"year\" shows data for each year in sequence).\n\n**Keywords:** chart, bar, column, comparison, category, visualization, animation\n\n**Example:**\n```tsx\n<BarChart data={data} xKey=\"category\" yKey=\"value\" />\n<BarChart data={data} xKey=\"month\" yKey={[\"sales\", \"costs\"]} stacked />\n<BarChart data={data} xKey=\"region\" yKey=\"revenue\" animateBy=\"year\" />\n```\n\n### PieChart\n\nPie/donut chart for showing proportional data. Set innerRadius > 0 to create a donut chart. Works standalone or inside LiveValue for live SQL data. Supports animation: use animateBy=\"fieldName\" to animate through distinct values of that field (e.g., animateBy=\"quarter\" shows pie for each quarter).\n\n**Keywords:** chart, pie, donut, proportion, percentage, visualization, animation\n\n**Example:**\n```tsx\n<PieChart data={data} valueKey=\"count\" nameKey=\"category\" />\n<PieChart data={data} valueKey=\"amount\" nameKey=\"type\" innerRadius={60} />\n<PieChart data={data} valueKey=\"share\" nameKey=\"segment\" animateBy=\"quarter\" />\n```\n\n### Chart\n\nGeneric chart component for full Vega-Lite specifications. Use this for AI-generated advanced charts like boxplots, heatmaps, scatter matrices. Works standalone or inside LiveValue for live SQL data.\n\n**Keywords:** chart, vega, visualization, custom, advanced\n\n**Example:**\n```tsx\n<Chart vegaSpec={{ mark: \"boxplot\", encoding: { x: { field: \"category\" }, y: { field: \"value\" } } }} />\n<Chart vegaSpec={{ mark: \"rect\", encoding: { x: { field: \"x\" }, y: { field: \"y\" }, color: { field: \"value\" } } }} />\n```\n\n### LineChart\n\nLine chart for visualizing trends over time or continuous data. Works standalone or inside LiveValue for live SQL data. Supports animation: use animateBy=\"fieldName\" to animate through distinct values of that field (e.g., animateBy=\"year\" cycles through years).\n\n**Keywords:** chart, line, graph, trend, time series, visualization, animation\n\n**Example:**\n```tsx\n<LineChart data={data} xKey=\"date\" yKey=\"revenue\" />\n<LineChart data={data} xKey=\"month\" yKey={[\"sales\", \"expenses\"]} showLegend />\n<LineChart data={data} xKey=\"date\" yKey=\"value\" animateBy=\"year\" />\n```\n\n### Metric\n\nKPI display for showing a single metric value with optional label and change indicator. Perfect for dashboards showing counts, percentages, or any key performance indicator. Can consume data from parent LiveValue context or use direct value prop.\n\n**Keywords:** metric, kpi, number, stat, dashboard, counter, value, indicator\n\n**Example:**\n```tsx\n// Standalone with direct value\n<Metric label=\"Total Users\" value={1234} />\n<Metric label=\"Revenue\" value={50000} prefix=\"$\" change={12.5} />\n\n// With LiveValue data context (value comes from query)\n<LiveValue query=\"SELECT SUM(amount) as value FROM orders\">\n  <Metric label=\"Total Revenue\" prefix=\"$\" />\n</LiveValue>\n```\n\n### Alert\n\nCallout message box for displaying info, warnings, errors, or success messages. Use to highlight important information or feedback to users.\n\n**Keywords:** alert, callout, message, info, warning, error, success, notification\n\n**Example:**\n```tsx\n<Alert>This is an informational message.</Alert>\n<Alert variant=\"success\" title=\"Success!\">Your changes have been saved.</Alert>\n<Alert variant=\"warning\">Please review before continuing.</Alert>\n<Alert variant=\"destructive\" title=\"Error\">Something went wrong.</Alert>\n```\n\n### Block\n\nEmbeds reusable MDX blocks inline, or creates new ones with AI assistance. Supports embedding from pages/blocks/, inline editing, and AI generation.\n\n**Keywords:** block, embed, include, component, reuse, template, ai\n\n**Example:**\n```tsx\n<Block src=\"blocks/header\" />\n<Block src=\"blocks/user-card\" params={{userId: 123}} />\n<Block editing prompt=\"create a metrics card\" />\n```\n\n### Badge\n\nInline status indicator for labeling items with semantic colors. Use for status indicators, tags, or category labels.\n\n**Keywords:** badge, tag, status, label, indicator, pill\n\n**Example:**\n```tsx\n<Badge>Active</Badge>\n<Badge variant=\"success\">Completed</Badge>\n<Badge variant=\"warning\">Pending</Badge>\n<Badge variant=\"destructive\">Failed</Badge>\n```\n\n\n---\n\n## Action Components\n\nInteractive components for building forms that trigger SQL mutations.\n\n### LiveAction\n\nContainer that wraps form controls and executes SQL mutations on submit. Children can use {{fieldName}} bindings in the SQL that get replaced with form values.\n\n**Keywords:** form, action, mutation, sql, update, insert, delete, submit\n\n**Example:**\n```tsx\n<LiveAction sql=\"UPDATE tasks SET status = {{status}} WHERE id = 1\">\n  <Select name=\"status\" options={[{value: \"done\", label: \"Done\"}]} />\n  <Button>Update</Button>\n</LiveAction>\n```\n\n### Button\n\nButton that triggers the parent LiveAction's SQL execution on click. Must be used inside a LiveAction container.\n\n**Keywords:** button, submit, action, trigger, form\n\n**Example:**\n```tsx\n<LiveAction sql=\"UPDATE tasks SET done = true WHERE id = 1\">\n  <Button>Mark Complete</Button>\n</LiveAction>\n```\n\n### Checkbox\n\nCheckbox that registers its value with parent LiveAction for SQL binding. The `name` prop determines the {{name}} placeholder in SQL (returns true/false).\n\n**Keywords:** checkbox, boolean, toggle, form, field, binding\n\n**Example:**\n```tsx\n<LiveAction sql=\"UPDATE tasks SET done = {{done}} WHERE id = 1\">\n  <Checkbox name=\"done\">Mark as complete</Checkbox>\n  <Button>Save</Button>\n</LiveAction>\n```\n\n### Select\n\nDropdown select that registers its value with parent LiveAction for SQL binding. The `name` prop determines the {{name}} placeholder in SQL.\n\n**Keywords:** select, dropdown, form, field, binding, options\n\n**Example:**\n```tsx\n<LiveAction sql=\"UPDATE tasks SET status = {{status}} WHERE id = 1\">\n  <Select\n    name=\"status\"\n    options={[\n      { value: \"pending\", label: \"Pending\" },\n      { value: \"done\", label: \"Done\" }\n    ]}\n  />\n  <Button>Update</Button>\n</LiveAction>\n```\n\n### Textarea\n\nMultiline text input that registers its value with parent LiveAction for SQL binding. The `name` prop determines the {{name}} placeholder in SQL.\n\n**Keywords:** textarea, multiline, text, form, field, binding\n\n**Example:**\n```tsx\n<LiveAction sql=\"UPDATE posts SET content = {{content}} WHERE id = 1\">\n  <Textarea name=\"content\" placeholder=\"Enter content...\" rows={5} />\n  <Button>Save</Button>\n</LiveAction>\n```\n\n### Input\n\nText input with optional masking and automatic validation.\n\n**Example:**\n```tsx\n<Input name=\"email\" label=\"Email\" placeholder=\"you@example.com\" />\n<Input name=\"phone\" label=\"Phone\" mask=\"phone\" />\n<Input name=\"card\" label=\"Card\" mask=\"creditCard\" />\n<Input name=\"amount\" label=\"Amount\" mask=\"currency\" />\n```\n\n\n---\n\n## Data Components\n\nSelf-contained data management components with full CRUD support.\n\n### Kanban\n\nDrag-and-drop Kanban board that displays data grouped by a column. Cards can be dragged between columns to update the underlying data. Must be wrapped in a LiveValue to receive data. REQUIRED: groupByColumn (column to group by), cardTitleField (field for card title). OPTIONAL: fixedColumns (always show these columns in order, filter data to match), columnOrder (explicit column order + extras from data), cardFields (additional fields on cards), idField (primary key, default 'id'), updateSql (auto-generated from parent query if not provided).\n\n**Keywords:** kanban, board, drag, drop, cards, columns, status, workflow, tasks, fixed\n\n**Example:**\n```tsx\n<LiveValue query=\"SELECT id, title, status FROM tasks\">\n  <Kanban groupByColumn=\"status\" cardTitleField=\"title\" fixedColumns={[\"todo\", \"in_progress\", \"done\"]} />\n</LiveValue>\n```\n\n### DataGrid\n\nHigh-performance editable data grid with virtualization, keyboard navigation, and comprehensive cell editing. Supports sorting, searching, and clipboard operations.\n\n**Keywords:** grid, table, data, spreadsheet, edit, sort, filter, virtual\n\n**Example:**\n```tsx\n<DataGrid data={data} />\n<DataGrid data={data} height={400} readOnly />\n<DataGrid data={data} columns={[{key: \"name\", label: \"Name\"}, {key: \"email\", label: \"Email\"}]} />\n```\n\n";

// Component metadata
export const STDLIB_COMPONENTS = {
  "LiveAction": {
    "category": "action",
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
    "example": "<LiveAction sql=\"UPDATE tasks SET status = {{status}} WHERE id = 1\">\n  <Select name=\"status\" options={[{value: \"done\", label: \"Done\"}]} />\n  <Button>Update</Button>\n</LiveAction>"
  },
  "Button": {
    "category": "action",
    "description": "Button that triggers the parent LiveAction's SQL execution on click. Must be used inside a LiveAction container.",
    "keywords": [
      "button",
      "submit",
      "action",
      "trigger",
      "form"
    ],
    "example": "<LiveAction sql=\"UPDATE tasks SET done = true WHERE id = 1\">\n  <Button>Mark Complete</Button>\n</LiveAction>"
  },
  "Checkbox": {
    "category": "action",
    "description": "Checkbox that registers its value with parent LiveAction for SQL binding. The `name` prop determines the {{name}} placeholder in SQL (returns true/false).",
    "keywords": [
      "checkbox",
      "boolean",
      "toggle",
      "form",
      "field",
      "binding"
    ],
    "example": "<LiveAction sql=\"UPDATE tasks SET done = {{done}} WHERE id = 1\">\n  <Checkbox name=\"done\">Mark as complete</Checkbox>\n  <Button>Save</Button>\n</LiveAction>"
  },
  "Select": {
    "category": "action",
    "description": "Dropdown select that registers its value with parent LiveAction for SQL binding. The `name` prop determines the {{name}} placeholder in SQL.",
    "keywords": [
      "select",
      "dropdown",
      "form",
      "field",
      "binding",
      "options"
    ],
    "example": "<LiveAction sql=\"UPDATE tasks SET status = {{status}} WHERE id = 1\">\n  <Select\n    name=\"status\"\n    options={[\n      { value: \"pending\", label: \"Pending\" },\n      { value: \"done\", label: \"Done\" }\n    ]}\n  />\n  <Button>Update</Button>\n</LiveAction>"
  },
  "Textarea": {
    "category": "action",
    "description": "Multiline text input that registers its value with parent LiveAction for SQL binding. The `name` prop determines the {{name}} placeholder in SQL.",
    "keywords": [
      "textarea",
      "multiline",
      "text",
      "form",
      "field",
      "binding"
    ],
    "example": "<LiveAction sql=\"UPDATE posts SET content = {{content}} WHERE id = 1\">\n  <Textarea name=\"content\" placeholder=\"Enter content...\" rows={5} />\n  <Button>Save</Button>\n</LiveAction>"
  },
  "Input": {
    "category": "action",
    "description": "Text input with optional masking and automatic validation.",
    "keywords": [],
    "example": "<Input name=\"email\" label=\"Email\" placeholder=\"you@example.com\" />\n<Input name=\"phone\" label=\"Phone\" mask=\"phone\" />\n<Input name=\"card\" label=\"Card\" mask=\"creditCard\" />\n<Input name=\"amount\" label=\"Amount\" mask=\"currency\" />"
  },
  "InteractiveMap": {
    "category": "view",
    "description": "Interactive MapLibre GL map with pan/zoom, markers, and popups. Uses free CARTO basemap tiles (no API key required). Supports light/dark/voyager styles.",
    "keywords": [
      "map",
      "interactive",
      "maplibre",
      "markers",
      "popups",
      "pan",
      "zoom",
      "geolocation",
      "location"
    ],
    "example": "<InteractiveMap longitude={-122.4} latitude={37.8} zoom={12} />\n<InteractiveMap longitude={-74.006} latitude={40.7128} zoom={10} mapStyle=\"dark\">\n  <MapMarker longitude={-74.006} latitude={40.7128} popup=\"New York City\" />\n  <MapControls />\n</InteractiveMap>"
  },
  "Tabs": {
    "category": "view",
    "description": "Tabbed navigation for organizing content into switchable panels. Use for dashboards, settings pages, or any content that benefits from tab navigation.",
    "keywords": [
      "tabs",
      "navigation",
      "panels",
      "switch",
      "organize",
      "sections"
    ],
    "example": "<Tabs defaultValue=\"overview\">\n  <Tab value=\"overview\" label=\"Overview\">Overview content here</Tab>\n  <Tab value=\"metrics\" label=\"Metrics\">Metrics and charts</Tab>\n  <Tab value=\"settings\" label=\"Settings\">Configuration options</Tab>\n</Tabs>"
  },
  "Loader": {
    "category": "view",
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
    "category": "view",
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
    "category": "view",
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
    "category": "view",
    "description": "Area chart for visualizing trends with filled regions. Supports stacking for comparing cumulative values. Works standalone or inside LiveValue for live SQL data. Supports animation: use animateBy=\"fieldName\" to animate through distinct values of that field.",
    "keywords": [
      "chart",
      "area",
      "filled",
      "trend",
      "cumulative",
      "visualization",
      "animation"
    ],
    "example": "<AreaChart data={data} xKey=\"date\" yKey=\"pageviews\" />\n<AreaChart data={data} xKey=\"month\" yKey={[\"revenue\", \"costs\"]} stacked />\n<AreaChart data={data} xKey=\"date\" yKey=\"users\" animateBy=\"year\" />"
  },
  "BarChart": {
    "category": "view",
    "description": "Bar chart for comparing categorical data. Supports vertical/horizontal orientation and stacked bars. Works standalone or inside LiveValue for live SQL data. Supports animation: use animateBy=\"fieldName\" to animate through distinct values of that field (e.g., animateBy=\"year\" shows data for each year in sequence).",
    "keywords": [
      "chart",
      "bar",
      "column",
      "comparison",
      "category",
      "visualization",
      "animation"
    ],
    "example": "<BarChart data={data} xKey=\"category\" yKey=\"value\" />\n<BarChart data={data} xKey=\"month\" yKey={[\"sales\", \"costs\"]} stacked />\n<BarChart data={data} xKey=\"region\" yKey=\"revenue\" animateBy=\"year\" />"
  },
  "PieChart": {
    "category": "view",
    "description": "Pie/donut chart for showing proportional data. Set innerRadius > 0 to create a donut chart. Works standalone or inside LiveValue for live SQL data. Supports animation: use animateBy=\"fieldName\" to animate through distinct values of that field (e.g., animateBy=\"quarter\" shows pie for each quarter).",
    "keywords": [
      "chart",
      "pie",
      "donut",
      "proportion",
      "percentage",
      "visualization",
      "animation"
    ],
    "example": "<PieChart data={data} valueKey=\"count\" nameKey=\"category\" />\n<PieChart data={data} valueKey=\"amount\" nameKey=\"type\" innerRadius={60} />\n<PieChart data={data} valueKey=\"share\" nameKey=\"segment\" animateBy=\"quarter\" />"
  },
  "Chart": {
    "category": "view",
    "description": "Generic chart component for full Vega-Lite specifications. Use this for AI-generated advanced charts like boxplots, heatmaps, scatter matrices. Works standalone or inside LiveValue for live SQL data.",
    "keywords": [
      "chart",
      "vega",
      "visualization",
      "custom",
      "advanced"
    ],
    "example": "<Chart vegaSpec={{ mark: \"boxplot\", encoding: { x: { field: \"category\" }, y: { field: \"value\" } } }} />\n<Chart vegaSpec={{ mark: \"rect\", encoding: { x: { field: \"x\" }, y: { field: \"y\" }, color: { field: \"value\" } } }} />"
  },
  "LineChart": {
    "category": "view",
    "description": "Line chart for visualizing trends over time or continuous data. Works standalone or inside LiveValue for live SQL data. Supports animation: use animateBy=\"fieldName\" to animate through distinct values of that field (e.g., animateBy=\"year\" cycles through years).",
    "keywords": [
      "chart",
      "line",
      "graph",
      "trend",
      "time series",
      "visualization",
      "animation"
    ],
    "example": "<LineChart data={data} xKey=\"date\" yKey=\"revenue\" />\n<LineChart data={data} xKey=\"month\" yKey={[\"sales\", \"expenses\"]} showLegend />\n<LineChart data={data} xKey=\"date\" yKey=\"value\" animateBy=\"year\" />"
  },
  "Metric": {
    "category": "view",
    "description": "KPI display for showing a single metric value with optional label and change indicator. Perfect for dashboards showing counts, percentages, or any key performance indicator. Can consume data from parent LiveValue context or use direct value prop.",
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
    "example": "// Standalone with direct value\n<Metric label=\"Total Users\" value={1234} />\n<Metric label=\"Revenue\" value={50000} prefix=\"$\" change={12.5} />\n\n// With LiveValue data context (value comes from query)\n<LiveValue query=\"SELECT SUM(amount) as value FROM orders\">\n  <Metric label=\"Total Revenue\" prefix=\"$\" />\n</LiveValue>"
  },
  "Alert": {
    "category": "view",
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
  "Block": {
    "category": "view",
    "description": "Embeds reusable MDX blocks inline, or creates new ones with AI assistance. Supports embedding from pages/blocks/, inline editing, and AI generation.",
    "keywords": [
      "block",
      "embed",
      "include",
      "component",
      "reuse",
      "template",
      "ai"
    ],
    "example": "<Block src=\"blocks/header\" />\n<Block src=\"blocks/user-card\" params={{userId: 123}} />\n<Block editing prompt=\"create a metrics card\" />"
  },
  "Badge": {
    "category": "view",
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
  "Kanban": {
    "category": "data",
    "description": "Drag-and-drop Kanban board that displays data grouped by a column. Cards can be dragged between columns to update the underlying data. Must be wrapped in a LiveValue to receive data. REQUIRED: groupByColumn (column to group by), cardTitleField (field for card title). OPTIONAL: fixedColumns (always show these columns in order, filter data to match), columnOrder (explicit column order + extras from data), cardFields (additional fields on cards), idField (primary key, default 'id'), updateSql (auto-generated from parent query if not provided).",
    "keywords": [
      "kanban",
      "board",
      "drag",
      "drop",
      "cards",
      "columns",
      "status",
      "workflow",
      "tasks",
      "fixed"
    ],
    "example": "<LiveValue query=\"SELECT id, title, status FROM tasks\">\n  <Kanban groupByColumn=\"status\" cardTitleField=\"title\" fixedColumns={[\"todo\", \"in_progress\", \"done\"]} />\n</LiveValue>"
  },
  "DataGrid": {
    "category": "data",
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
  }
} as const;

// Component names by category
export const VIEW_COMPONENTS = ["InteractiveMap","Tabs","Loader","Progress","LiveValue","AreaChart","BarChart","PieChart","Chart","LineChart","Metric","Alert","Block","Badge"] as const;
export const ACTION_COMPONENTS = ["LiveAction","Button","Checkbox","Select","Textarea","Input"] as const;
export const DATA_COMPONENTS = ["Kanban","DataGrid"] as const;

// All component names
export const ALL_COMPONENTS = [...VIEW_COMPONENTS, ...ACTION_COMPONENTS, ...DATA_COMPONENTS] as const;

// Legacy aliases
export const STATIC_COMPONENTS = VIEW_COMPONENTS;
export const ACTIVE_COMPONENTS = ACTION_COMPONENTS;

// Component schema for validation/linting
export const COMPONENT_SCHEMA = {
  "LiveAction": {
    "category": "action",
    "propRules": {},
    "constraints": {
      "requireChild": [
        "Button"
      ]
    }
  },
  "Button": {
    "category": "action",
    "propRules": {},
    "constraints": {
      "requireParent": [
        "LiveAction"
      ]
    }
  },
  "Checkbox": {
    "category": "action",
    "requiredProps": [
      "name"
    ],
    "constraints": {
      "requireParent": [
        "LiveAction"
      ]
    }
  },
  "Select": {
    "category": "action",
    "requiredProps": [
      "name",
      "options"
    ],
    "constraints": {
      "requireParent": [
        "LiveAction"
      ]
    }
  },
  "Textarea": {
    "category": "action",
    "requiredProps": [
      "name"
    ],
    "constraints": {
      "requireParent": [
        "LiveAction"
      ]
    }
  },
  "Input": {
    "category": "action",
    "requiredProps": [
      "name"
    ],
    "propRules": {},
    "constraints": {
      "requireParent": [
        "LiveAction"
      ]
    }
  },
  "Tabs": {
    "category": "view",
    "constraints": {
      "requireChild": [
        "Tab"
      ]
    }
  },
  "LiveValue": {
    "category": "view",
    "propRules": {},
    "constraints": {
      "forbidChild": [
        "Button",
        "Input",
        "Select",
        "Checkbox",
        "Textarea"
      ]
    }
  },
  "Kanban": {
    "category": "data",
    "requiredProps": [
      "groupByColumn",
      "cardTitleField"
    ],
    "constraints": {
      "requireParent": [
        "LiveValue"
      ]
    }
  }
} as const;

// Quick reference for agents (shorter than full docs)
export const STDLIB_QUICK_REF = "\n## Stdlib Components\n\n### View (Display)\n- **InteractiveMap**: Interactive MapLibre GL map with pan/zoom, markers, and popups. Uses free CARTO basemap tiles (no API key required). Supports light/dark/voyager styles.\n- **Tabs**: Tabbed navigation for organizing content into switchable panels. Use for dashboards, settings pages, or any content that benefits from tab navigation.\n- **Loader**: Animated loading indicator with multiple visual styles. Supports spinner, dots, bars, pulse, ring, bounce, wave, and square variants.\n- **Progress**: Progress bar for displaying completion status or loading states. Supports determinate (with value) and indeterminate (loading) modes.\n- **LiveValue**: Displays live SQL query results. Auto-selects display format based on data shape: inline (1×1), list (N×1), or table (N×M). Supports template mode with {{field}} bindings.\n- **AreaChart**: Area chart for visualizing trends with filled regions. Supports stacking for comparing cumulative values. Works standalone or inside LiveValue for live SQL data. Supports animation: use animateBy=\"fieldName\" to animate through distinct values of that field.\n- **BarChart**: Bar chart for comparing categorical data. Supports vertical/horizontal orientation and stacked bars. Works standalone or inside LiveValue for live SQL data. Supports animation: use animateBy=\"fieldName\" to animate through distinct values of that field (e.g., animateBy=\"year\" shows data for each year in sequence).\n- **PieChart**: Pie/donut chart for showing proportional data. Set innerRadius > 0 to create a donut chart. Works standalone or inside LiveValue for live SQL data. Supports animation: use animateBy=\"fieldName\" to animate through distinct values of that field (e.g., animateBy=\"quarter\" shows pie for each quarter).\n- **Chart**: Generic chart component for full Vega-Lite specifications. Use this for AI-generated advanced charts like boxplots, heatmaps, scatter matrices. Works standalone or inside LiveValue for live SQL data.\n- **LineChart**: Line chart for visualizing trends over time or continuous data. Works standalone or inside LiveValue for live SQL data. Supports animation: use animateBy=\"fieldName\" to animate through distinct values of that field (e.g., animateBy=\"year\" cycles through years).\n- **Metric**: KPI display for showing a single metric value with optional label and change indicator. Perfect for dashboards showing counts, percentages, or any key performance indicator. Can consume data from parent LiveValue context or use direct value prop.\n- **Alert**: Callout message box for displaying info, warnings, errors, or success messages. Use to highlight important information or feedback to users.\n- **Block**: Embeds reusable MDX blocks inline, or creates new ones with AI assistance. Supports embedding from pages/blocks/, inline editing, and AI generation.\n- **Badge**: Inline status indicator for labeling items with semantic colors. Use for status indicators, tags, or category labels.\n\n### Action (Interactive)\n- **LiveAction**: Container that wraps form controls and executes SQL mutations on submit. Children can use {{fieldName}} bindings in the SQL that get replaced with form values.\n- **Button**: Button that triggers the parent LiveAction's SQL execution on click. Must be used inside a LiveAction container.\n- **Checkbox**: Checkbox that registers its value with parent LiveAction for SQL binding. The `name` prop determines the {{name}} placeholder in SQL (returns true/false).\n- **Select**: Dropdown select that registers its value with parent LiveAction for SQL binding. The `name` prop determines the {{name}} placeholder in SQL.\n- **Textarea**: Multiline text input that registers its value with parent LiveAction for SQL binding. The `name` prop determines the {{name}} placeholder in SQL.\n- **Input**: Text input with optional masking and automatic validation.\n\n### Data (CRUD)\n- **Kanban**: Drag-and-drop Kanban board that displays data grouped by a column. Cards can be dragged between columns to update the underlying data. Must be wrapped in a LiveValue to receive data. REQUIRED: groupByColumn (column to group by), cardTitleField (field for card title). OPTIONAL: fixedColumns (always show these columns in order, filter data to match), columnOrder (explicit column order + extras from data), cardFields (additional fields on cards), idField (primary key, default 'id'), updateSql (auto-generated from parent query if not provided).\n- **DataGrid**: High-performance editable data grid with virtualization, keyboard navigation, and comprehensive cell editing. Supports sorting, searching, and clipboard operations.\n";
