# Hands Standard Library

Component reference for the Hands data application framework.

## Overview

The stdlib provides two categories of components:

- **Static** - Display-only components that render data
- **Active** - Interactive components that handle user input and execute SQL mutations

---

## Static Components

Display-only components that render live data from SQL queries.

### LiveValue

Displays live SQL query results. Auto-selects display format based on data shape: inline (1×1), list (N×1), or table (N×M). Supports template mode with {{field}} bindings.

**Keywords:** sql, query, data, display, table, list, inline, live, reactive

**Example:**
```tsx
<LiveValue sql="SELECT count(*) FROM users" />
<LiveValue sql="SELECT name FROM users" display="list" />
<LiveValue sql="SELECT * FROM tasks WHERE status = 'active'" display="table" />
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

