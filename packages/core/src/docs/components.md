# Hands Standard Library

Component reference for the Hands data application framework.

## Overview

The stdlib provides two categories of components:

- **Static** - Display-only components that render data
- **Active** - Interactive components that handle user input and execute SQL mutations

---

## Static Components

Display-only components that render live data from SQL queries.

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

## Active Components

Interactive components for building forms that execute SQL mutations.

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

