# Hands Standard Library

Component reference for the Hands data application framework.

## Overview

The stdlib provides three categories of components:

- **View** - Display-only components that render data
- **Action** - Interactive components that trigger discrete actions
- **Data** - Self-contained data management with CRUD operations

---

## View Components

Display-only components that render live data from SQL queries.

### InteractiveMap

Interactive MapLibre GL map with pan/zoom, markers, and popups. Uses free CARTO basemap tiles (no API key required). Supports light/dark/voyager styles.

**Keywords:** map, interactive, maplibre, markers, popups, pan, zoom, geolocation, location

**Example:**
```tsx
<InteractiveMap longitude={-122.4} latitude={37.8} zoom={12} />
<InteractiveMap longitude={-74.006} latitude={40.7128} zoom={10} mapStyle="dark">
  <MapMarker longitude={-74.006} latitude={40.7128} popup="New York City" />
  <MapControls />
</InteractiveMap>
```

### Tabs

Tabbed navigation for organizing content into switchable panels. Use for dashboards, settings pages, or any content that benefits from tab navigation.

**Keywords:** tabs, navigation, panels, switch, organize, sections

**Example:**
```tsx
<Tabs defaultValue="overview">
  <Tab value="overview" label="Overview">Overview content here</Tab>
  <Tab value="metrics" label="Metrics">Metrics and charts</Tab>
  <Tab value="settings" label="Settings">Configuration options</Tab>
</Tabs>
```

### Loader

Animated loading indicator with multiple visual styles. Supports spinner, dots, bars, pulse, ring, bounce, wave, and square variants.

**Keywords:** loader, loading, spinner, dots, progress, animation, wait

**Example:**
```tsx
<Loader />
<Loader variant="dots" size="lg" />
<Loader variant="bars" color="primary" label="Loading..." />
```

### Progress

Progress bar for displaying completion status or loading states. Supports determinate (with value) and indeterminate (loading) modes.

**Keywords:** progress, bar, loading, percentage, completion, status

**Example:**
```tsx
<Progress value={75} />
<Progress value={45} label="Upload Progress" showValue />
<Progress indeterminate />
```

### LiveValue

Displays live SQL query results. Auto-selects display format based on data shape: inline (1×1), list (N×1), or table (N×M). Supports template mode with {{field}} bindings.

**Keywords:** sql, query, data, display, table, list, inline, live, reactive

**Example:**
```tsx
<LiveValue sql="SELECT count(*) FROM users" />
<LiveValue sql="SELECT name FROM users" display="list" />
<LiveValue sql="SELECT * FROM tasks WHERE status = 'active'" display="table" />
```

### AreaChart

Area chart for visualizing trends with filled regions. Supports stacking for comparing cumulative values. Works standalone or inside LiveValue for live SQL data. Supports animation: use animateBy="fieldName" to animate through distinct values of that field.

**Keywords:** chart, area, filled, trend, cumulative, visualization, animation

**Example:**
```tsx
<AreaChart data={data} xKey="date" yKey="pageviews" />
<AreaChart data={data} xKey="month" yKey={["revenue", "costs"]} stacked />
<AreaChart data={data} xKey="date" yKey="users" animateBy="year" />
```

### BarChart

Bar chart for comparing categorical data. Supports vertical/horizontal orientation and stacked bars. Works standalone or inside LiveValue for live SQL data. Supports animation: use animateBy="fieldName" to animate through distinct values of that field (e.g., animateBy="year" shows data for each year in sequence).

**Keywords:** chart, bar, column, comparison, category, visualization, animation

**Example:**
```tsx
<BarChart data={data} xKey="category" yKey="value" />
<BarChart data={data} xKey="month" yKey={["sales", "costs"]} stacked />
<BarChart data={data} xKey="region" yKey="revenue" animateBy="year" />
```

### PieChart

Pie/donut chart for showing proportional data. Set innerRadius > 0 to create a donut chart. Works standalone or inside LiveValue for live SQL data. Supports animation: use animateBy="fieldName" to animate through distinct values of that field (e.g., animateBy="quarter" shows pie for each quarter).

**Keywords:** chart, pie, donut, proportion, percentage, visualization, animation

**Example:**
```tsx
<PieChart data={data} valueKey="count" nameKey="category" />
<PieChart data={data} valueKey="amount" nameKey="type" innerRadius={60} />
<PieChart data={data} valueKey="share" nameKey="segment" animateBy="quarter" />
```

### Chart

Generic chart component for full Vega-Lite specifications. Use this for AI-generated advanced charts like boxplots, heatmaps, scatter matrices. Works standalone or inside LiveValue for live SQL data.

**Keywords:** chart, vega, visualization, custom, advanced

**Example:**
```tsx
<Chart vegaSpec={{ mark: "boxplot", encoding: { x: { field: "category" }, y: { field: "value" } } }} />
<Chart vegaSpec={{ mark: "rect", encoding: { x: { field: "x" }, y: { field: "y" }, color: { field: "value" } } }} />
```

### LineChart

Line chart for visualizing trends over time or continuous data. Works standalone or inside LiveValue for live SQL data. Supports animation: use animateBy="fieldName" to animate through distinct values of that field (e.g., animateBy="year" cycles through years).

**Keywords:** chart, line, graph, trend, time series, visualization, animation

**Example:**
```tsx
<LineChart data={data} xKey="date" yKey="revenue" />
<LineChart data={data} xKey="month" yKey={["sales", "expenses"]} showLegend />
<LineChart data={data} xKey="date" yKey="value" animateBy="year" />
```

### Metric

KPI display for showing a single metric value with optional label and change indicator. Perfect for dashboards showing counts, percentages, or any key performance indicator. Can consume data from parent LiveValue context or use direct value prop.

**Keywords:** metric, kpi, number, stat, dashboard, counter, value, indicator

**Example:**
```tsx
// Standalone with direct value
<Metric label="Total Users" value={1234} />
<Metric label="Revenue" value={50000} prefix="$" change={12.5} />

// With LiveValue data context (value comes from query)
<LiveValue query="SELECT SUM(amount) as value FROM orders">
  <Metric label="Total Revenue" prefix="$" />
</LiveValue>
```

### Alert

Callout message box for displaying info, warnings, errors, or success messages. Use to highlight important information or feedback to users.

**Keywords:** alert, callout, message, info, warning, error, success, notification

**Example:**
```tsx
<Alert>This is an informational message.</Alert>
<Alert variant="success" title="Success!">Your changes have been saved.</Alert>
<Alert variant="warning">Please review before continuing.</Alert>
<Alert variant="destructive" title="Error">Something went wrong.</Alert>
```

### Block

Embeds reusable MDX blocks inline, or creates new ones with AI assistance. Supports embedding from pages/blocks/, inline editing, and AI generation.

**Keywords:** block, embed, include, component, reuse, template, ai

**Example:**
```tsx
<Block src="blocks/header" />
<Block src="blocks/user-card" params={{userId: 123}} />
<Block editing prompt="create a metrics card" />
```

### Badge

Inline status indicator for labeling items with semantic colors. Use for status indicators, tags, or category labels.

**Keywords:** badge, tag, status, label, indicator, pill

**Example:**
```tsx
<Badge>Active</Badge>
<Badge variant="success">Completed</Badge>
<Badge variant="warning">Pending</Badge>
<Badge variant="destructive">Failed</Badge>
```


---

## Action Components

Interactive components for building forms that trigger SQL mutations.

### LiveAction

Container that wraps form controls and executes SQL mutations on submit. Children can use {{fieldName}} bindings in the SQL that get replaced with form values.

**Keywords:** form, action, mutation, sql, update, insert, delete, submit

**Example:**
```tsx
<LiveAction sql="UPDATE tasks SET status = {{status}} WHERE id = 1">
  <Select name="status" options={[{value: "done", label: "Done"}]} />
  <Button>Update</Button>
</LiveAction>
```

### Button

Button that triggers the parent LiveAction's SQL execution on click. Must be used inside a LiveAction container.

**Keywords:** button, submit, action, trigger, form

**Example:**
```tsx
<LiveAction sql="UPDATE tasks SET done = true WHERE id = 1">
  <Button>Mark Complete</Button>
</LiveAction>
```

### Checkbox

Checkbox that registers its value with parent LiveAction for SQL binding. The `name` prop determines the {{name}} placeholder in SQL (returns true/false).

**Keywords:** checkbox, boolean, toggle, form, field, binding

**Example:**
```tsx
<LiveAction sql="UPDATE tasks SET done = {{done}} WHERE id = 1">
  <Checkbox name="done">Mark as complete</Checkbox>
  <Button>Save</Button>
</LiveAction>
```

### Select

Dropdown select that registers its value with parent LiveAction for SQL binding. The `name` prop determines the {{name}} placeholder in SQL.

**Keywords:** select, dropdown, form, field, binding, options

**Example:**
```tsx
<LiveAction sql="UPDATE tasks SET status = {{status}} WHERE id = 1">
  <Select
    name="status"
    options={[
      { value: "pending", label: "Pending" },
      { value: "done", label: "Done" }
    ]}
  />
  <Button>Update</Button>
</LiveAction>
```

### Textarea

Multiline text input that registers its value with parent LiveAction for SQL binding. The `name` prop determines the {{name}} placeholder in SQL.

**Keywords:** textarea, multiline, text, form, field, binding

**Example:**
```tsx
<LiveAction sql="UPDATE posts SET content = {{content}} WHERE id = 1">
  <Textarea name="content" placeholder="Enter content..." rows={5} />
  <Button>Save</Button>
</LiveAction>
```

### Input

Text input with optional masking and automatic validation.

**Example:**
```tsx
<Input name="email" label="Email" placeholder="you@example.com" />
<Input name="phone" label="Phone" mask="phone" />
<Input name="card" label="Card" mask="creditCard" />
<Input name="amount" label="Amount" mask="currency" />
```


---

## Data Components

Self-contained data management components with full CRUD support.

### Kanban

Drag-and-drop Kanban board that displays data grouped by a column. Cards can be dragged between columns to update the underlying data. Must be wrapped in a LiveValue to receive data. REQUIRED: groupByColumn (column to group by), cardTitleField (field for card title). OPTIONAL: fixedColumns (always show these columns in order, filter data to match), columnOrder (explicit column order + extras from data), cardFields (additional fields on cards), idField (primary key, default 'id'), updateSql (auto-generated from parent query if not provided).

**Keywords:** kanban, board, drag, drop, cards, columns, status, workflow, tasks, fixed

**Example:**
```tsx
<LiveValue query="SELECT id, title, status FROM tasks">
  <Kanban groupByColumn="status" cardTitleField="title" fixedColumns={["todo", "in_progress", "done"]} />
</LiveValue>
```

### DataGrid

High-performance editable data grid with virtualization, keyboard navigation, and comprehensive cell editing. Supports sorting, searching, and clipboard operations.

**Keywords:** grid, table, data, spreadsheet, edit, sort, filter, virtual

**Example:**
```tsx
<DataGrid data={data} />
<DataGrid data={data} height={400} readOnly />
<DataGrid data={data} columns={[{key: "name", label: "Name"}, {key: "email", label: "Email"}]} />
```

