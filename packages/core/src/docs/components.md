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

Area chart for visualizing trends with filled regions. Supports stacking for comparing cumulative values.

**Keywords:** chart, area, filled, trend, cumulative, visualization

**Example:**
```tsx
<AreaChart data={data} xKey="date" yKey="pageviews" />
<AreaChart data={data} xKey="month" yKey={["revenue", "costs"]} stacked />
```

### BarChart

Bar chart for comparing categorical data. Supports vertical/horizontal orientation and stacked bars.

**Keywords:** chart, bar, column, comparison, category, visualization

**Example:**
```tsx
<BarChart data={data} xKey="category" yKey="value" />
<BarChart data={data} xKey="month" yKey={["sales", "costs"]} stacked />
```

### PieChart

Pie/donut chart for showing proportional data. Set innerRadius > 0 to create a donut chart.

**Keywords:** chart, pie, donut, proportion, percentage, visualization

**Example:**
```tsx
<PieChart data={data} valueKey="count" nameKey="category" />
<PieChart data={data} valueKey="amount" nameKey="type" innerRadius={60} />
```

### LineChart

Line chart for visualizing trends over time or continuous data. Works standalone or inside LiveValue for live SQL data.

**Keywords:** chart, line, graph, trend, time series, visualization

**Example:**
```tsx
<LineChart data={data} xKey="date" yKey="revenue" />
<LineChart data={data} xKey="month" yKey={["sales", "expenses"]} showLegend />
```

### Metric

KPI display for showing a single metric value with optional label and change indicator. Perfect for dashboards showing counts, percentages, or any key performance indicator.

**Keywords:** metric, kpi, number, stat, dashboard, counter, value, indicator

**Example:**
```tsx
<Metric label="Total Users" value={1234} />
<Metric label="Revenue" value={50000} prefix="$" change={12.5} />
<Metric label="Error Rate" value={0.5} suffix="%" change={-8} changeLabel="vs last week" />
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
  <ActionSelect name="status" options={[{value: "done", label: "Done"}]} />
  <ActionButton>Update</ActionButton>
</LiveAction>
```

### ActionButton

Button that triggers the parent LiveAction's SQL execution on click. Must be used inside a LiveAction container.

**Keywords:** button, submit, action, trigger, form

**Example:**
```tsx
<LiveAction sql="UPDATE tasks SET done = true WHERE id = 1">
  <ActionButton>Mark Complete</ActionButton>
</LiveAction>
```

### ActionCheckbox

Checkbox that registers its value with parent LiveAction for SQL binding. The `name` prop determines the {{name}} placeholder in SQL (returns true/false).

**Keywords:** checkbox, boolean, toggle, form, field, binding

**Example:**
```tsx
<LiveAction sql="UPDATE tasks SET done = {{done}} WHERE id = 1">
  <ActionCheckbox name="done">Mark as complete</ActionCheckbox>
  <ActionButton>Save</ActionButton>
</LiveAction>
```

### ActionSelect

Dropdown select that registers its value with parent LiveAction for SQL binding. The `name` prop determines the {{name}} placeholder in SQL.

**Keywords:** select, dropdown, form, field, binding, options

**Example:**
```tsx
<LiveAction sql="UPDATE tasks SET status = {{status}} WHERE id = 1">
  <ActionSelect
    name="status"
    options={[
      { value: "pending", label: "Pending" },
      { value: "done", label: "Done" }
    ]}
  />
  <ActionButton>Update</ActionButton>
</LiveAction>
```

### ActionTextarea

Multiline text input that registers its value with parent LiveAction for SQL binding. The `name` prop determines the {{name}} placeholder in SQL.

**Keywords:** textarea, multiline, text, form, field, binding

**Example:**
```tsx
<LiveAction sql="UPDATE posts SET content = {{content}} WHERE id = 1">
  <ActionTextarea name="content" placeholder="Enter content..." rows={5} />
  <ActionButton>Save</ActionButton>
</LiveAction>
```

### ActionInput

Text input that registers its value with parent LiveAction for SQL binding. The `name` prop determines the {{name}} placeholder in SQL.

**Keywords:** input, text, form, field, binding

**Example:**
```tsx
<LiveAction sql="UPDATE users SET name = {{name}} WHERE id = 1">
  <ActionInput name="name" placeholder="Enter name" />
  <ActionButton>Save</ActionButton>
</LiveAction>
```


---

## Data Components

Self-contained data management components with full CRUD support.

### Kanban

Drag-and-drop Kanban board that displays SQL query results grouped by a column. Cards can be dragged between columns to update the underlying data.

**Keywords:** kanban, board, drag, drop, cards, columns, status, workflow, tasks

**Example:**
```tsx
<Kanban
  query="SELECT id, title, status FROM tasks"
  groupByColumn="status"
  cardTitleField="title"
  updateSql="UPDATE tasks SET status = {{status}} WHERE id = {{id}}"
/>
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

