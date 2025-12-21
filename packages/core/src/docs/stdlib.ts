/**
 * Stdlib Documentation - Auto-generated
 *
 * DO NOT EDIT - Run: bun run generate:docs
 */

// Full documentation as markdown (for system prompts)
export const STDLIB_DOCS = "# Hands Standard Library\n\nComponent reference for the Hands data application framework.\n\n## Overview\n\nThe stdlib provides two categories of components:\n\n- **Static** - Display-only components that render data\n- **Active** - Interactive components that handle user input and execute SQL mutations\n\n---\n\n## Static Components\n\nDisplay-only components that render live data from SQL queries.\n\n### LiveValue\n\nDisplays live SQL query results. Auto-selects display format based on data shape: inline (1×1), list (N×1), or table (N×M). Supports template mode with {{field}} bindings.\n\n**Keywords:** sql, query, data, display, table, list, inline, live, reactive\n\n**Example:**\n```tsx\n<LiveValue sql=\"SELECT count(*) FROM users\" />\n<LiveValue sql=\"SELECT name FROM users\" display=\"list\" />\n<LiveValue sql=\"SELECT * FROM tasks WHERE status = 'active'\" display=\"table\" />\n```\n\n\n---\n\n## Active Components\n\nInteractive components for building forms that execute SQL mutations.\n\n### LiveAction\n\nContainer that wraps form controls and executes SQL mutations on submit. Children can use {{fieldName}} bindings in the SQL that get replaced with form values.\n\n**Keywords:** form, action, mutation, sql, update, insert, delete, submit\n\n**Example:**\n```tsx\n<LiveAction sql=\"UPDATE tasks SET status = {{status}} WHERE id = 1\">\n  <ActionSelect name=\"status\" options={[{value: \"done\", label: \"Done\"}]} />\n  <ActionButton>Update</ActionButton>\n</LiveAction>\n```\n\n### ActionButton\n\nButton that triggers the parent LiveAction's SQL execution on click. Must be used inside a LiveAction container.\n\n**Keywords:** button, submit, action, trigger, form\n\n**Example:**\n```tsx\n<LiveAction sql=\"UPDATE tasks SET done = true WHERE id = 1\">\n  <ActionButton>Mark Complete</ActionButton>\n</LiveAction>\n```\n\n### ActionCheckbox\n\nCheckbox that registers its value with parent LiveAction for SQL binding. The `name` prop determines the {{name}} placeholder in SQL (returns true/false).\n\n**Keywords:** checkbox, boolean, toggle, form, field, binding\n\n**Example:**\n```tsx\n<LiveAction sql=\"UPDATE tasks SET done = {{done}} WHERE id = 1\">\n  <ActionCheckbox name=\"done\">Mark as complete</ActionCheckbox>\n  <ActionButton>Save</ActionButton>\n</LiveAction>\n```\n\n### ActionSelect\n\nDropdown select that registers its value with parent LiveAction for SQL binding. The `name` prop determines the {{name}} placeholder in SQL.\n\n**Keywords:** select, dropdown, form, field, binding, options\n\n**Example:**\n```tsx\n<LiveAction sql=\"UPDATE tasks SET status = {{status}} WHERE id = 1\">\n  <ActionSelect\n    name=\"status\"\n    options={[\n      { value: \"pending\", label: \"Pending\" },\n      { value: \"done\", label: \"Done\" }\n    ]}\n  />\n  <ActionButton>Update</ActionButton>\n</LiveAction>\n```\n\n### ActionTextarea\n\nMultiline text input that registers its value with parent LiveAction for SQL binding. The `name` prop determines the {{name}} placeholder in SQL.\n\n**Keywords:** textarea, multiline, text, form, field, binding\n\n**Example:**\n```tsx\n<LiveAction sql=\"UPDATE posts SET content = {{content}} WHERE id = 1\">\n  <ActionTextarea name=\"content\" placeholder=\"Enter content...\" rows={5} />\n  <ActionButton>Save</ActionButton>\n</LiveAction>\n```\n\n### ActionInput\n\nText input that registers its value with parent LiveAction for SQL binding. The `name` prop determines the {{name}} placeholder in SQL.\n\n**Keywords:** input, text, form, field, binding\n\n**Example:**\n```tsx\n<LiveAction sql=\"UPDATE users SET name = {{name}} WHERE id = 1\">\n  <ActionInput name=\"name\" placeholder=\"Enter name\" />\n  <ActionButton>Save</ActionButton>\n</LiveAction>\n```\n\n";

// Component metadata
export const STDLIB_COMPONENTS = {
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
export const STATIC_COMPONENTS = ["LiveValue"] as const;
export const ACTIVE_COMPONENTS = ["LiveAction","ActionButton","ActionCheckbox","ActionSelect","ActionTextarea","ActionInput"] as const;

// All component names
export const ALL_COMPONENTS = [...STATIC_COMPONENTS, ...ACTIVE_COMPONENTS] as const;

// Quick reference for agents (shorter than full docs)
export const STDLIB_QUICK_REF = "\n## Stdlib Components\n\n### Static (Display)\n- **LiveValue**: Displays live SQL query results. Auto-selects display format based on data shape: inline (1×1), list (N×1), or table (N×M). Supports template mode with {{field}} bindings.\n\n### Active (Interactive)\n- **LiveAction**: Container that wraps form controls and executes SQL mutations on submit. Children can use {{fieldName}} bindings in the SQL that get replaced with form values.\n- **ActionButton**: Button that triggers the parent LiveAction's SQL execution on click. Must be used inside a LiveAction container.\n- **ActionCheckbox**: Checkbox that registers its value with parent LiveAction for SQL binding. The `name` prop determines the {{name}} placeholder in SQL (returns true/false).\n- **ActionSelect**: Dropdown select that registers its value with parent LiveAction for SQL binding. The `name` prop determines the {{name}} placeholder in SQL.\n- **ActionTextarea**: Multiline text input that registers its value with parent LiveAction for SQL binding. The `name` prop determines the {{name}} placeholder in SQL.\n- **ActionInput**: Text input that registers its value with parent LiveAction for SQL binding. The `name` prop determines the {{name}} placeholder in SQL.\n";
