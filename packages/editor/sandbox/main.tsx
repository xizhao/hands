import "./styles.css";
import { LiveQueryProvider, type QueryResult, type TableSchema } from "@hands/core/stdlib";
import { Editor, type EditorHandle, EditorProvider, PreviewEditor } from "@hands/editor";
import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { mockTrpc } from "./mock-trpc";

// Mock data for different queries (matches QUERIES in mock-trpc.ts)
const MOCK_DATA: Record<string, Record<string, unknown>[]> = {
  // Sales data for charts
  "SELECT month, sales, revenue, profit FROM monthly_sales": [
    { month: "Jan", sales: 4000, revenue: 2400, profit: 1200 },
    { month: "Feb", sales: 3000, revenue: 1398, profit: 900 },
    { month: "Mar", sales: 2000, revenue: 9800, profit: 1800 },
    { month: "Apr", sales: 2780, revenue: 3908, profit: 1500 },
    { month: "May", sales: 1890, revenue: 4800, profit: 2100 },
    { month: "Jun", sales: 2390, revenue: 3800, profit: 1700 },
  ],
  // Category data for bar chart
  "SELECT category, value FROM categories": [
    { category: "Electronics", value: 4500 },
    { category: "Clothing", value: 3200 },
    { category: "Food", value: 2800 },
    { category: "Books", value: 1900 },
    { category: "Sports", value: 2100 },
  ],
  // Device data for pie chart
  "SELECT name, value FROM device_breakdown": [
    { name: "Desktop", value: 45 },
    { name: "Mobile", value: 35 },
    { name: "Tablet", value: 20 },
  ],
  // User table data
  "SELECT id, name, email, status, role FROM users LIMIT 10": [
    { id: 1, name: "Alice Johnson", email: "alice@example.com", status: "Active", role: "Admin" },
    { id: 2, name: "Bob Smith", email: "bob@example.com", status: "Active", role: "User" },
    { id: 3, name: "Carol White", email: "carol@example.com", status: "Pending", role: "User" },
    { id: 4, name: "David Brown", email: "david@example.com", status: "Active", role: "Editor" },
    { id: 5, name: "Eve Davis", email: "eve@example.com", status: "Inactive", role: "User" },
  ],
  // Count queries
  "SELECT COUNT(*) as count FROM users": [{ count: 42 }],
  "SELECT COUNT(*) FROM users": [{ "COUNT(*)": 42 }],
  // Existing feature status query
  "SELECT status, COUNT(*) as count FROM features GROUP BY status": [
    { status: "done", count: 12 },
    { status: "in_progress", count: 8 },
    { status: "todo", count: 5 },
  ],
};

// Mock schema for autocomplete
const MOCK_SCHEMA: TableSchema[] = [
  {
    table_name: "users",
    columns: [
      { name: "id", type: "INTEGER", nullable: false },
      { name: "name", type: "TEXT", nullable: false },
      { name: "email", type: "TEXT", nullable: false },
      { name: "status", type: "TEXT", nullable: true },
      { name: "role", type: "TEXT", nullable: true },
      { name: "created_at", type: "TIMESTAMP", nullable: false },
    ],
  },
  {
    table_name: "tasks",
    columns: [
      { name: "id", type: "INTEGER", nullable: false },
      { name: "title", type: "TEXT", nullable: false },
      { name: "description", type: "TEXT", nullable: true },
      { name: "status", type: "TEXT", nullable: false },
      { name: "priority", type: "INTEGER", nullable: true },
      { name: "user_id", type: "INTEGER", nullable: true },
      { name: "due_date", type: "DATE", nullable: true },
    ],
  },
  {
    table_name: "features",
    columns: [
      { name: "id", type: "INTEGER", nullable: false },
      { name: "name", type: "TEXT", nullable: false },
      { name: "status", type: "TEXT", nullable: false },
      { name: "priority", type: "INTEGER", nullable: true },
    ],
  },
  {
    table_name: "monthly_sales",
    columns: [
      { name: "month", type: "TEXT", nullable: false },
      { name: "sales", type: "INTEGER", nullable: false },
      { name: "revenue", type: "REAL", nullable: false },
      { name: "profit", type: "REAL", nullable: false },
    ],
  },
  {
    table_name: "categories",
    columns: [
      { name: "category", type: "TEXT", nullable: false },
      { name: "value", type: "INTEGER", nullable: false },
    ],
  },
  {
    table_name: "device_breakdown",
    columns: [
      { name: "name", type: "TEXT", nullable: false },
      { name: "value", type: "INTEGER", nullable: false },
    ],
  },
];

// Mock query hook for sandbox
function useMockQuery(sql: string): QueryResult {
  const data = MOCK_DATA[sql] ?? [{ result: `Mock result for: ${sql.slice(0, 30)}...` }];
  return { data, isLoading: false, error: null };
}

// Mock mutation hook for sandbox
function useMockMutation() {
  return {
    mutate: async (sql: string) => console.log("[Mock] Mutation:", sql),
    isPending: false,
    error: null,
  };
}

const initialMarkdown = `# Editor Sandbox

This is a standalone preview of the **@hands/editor** package.

## Inline Value

I have this many apples: <LiveValue query="SELECT COUNT(*) FROM users" /> - pretty cool right?

## Tabs Example

<Tabs defaultValue="overview">
  <Tab value="overview" label="Overview">
    This is the overview tab content. It can contain any content including text, charts, or other components.
  </Tab>
  <Tab value="metrics" label="Metrics">
    Here are some metrics and data visualizations.
  </Tab>
  <Tab value="settings" label="Settings">
    Configuration options would go here.
  </Tab>
</Tabs>

## Chart Example

<LiveValue query="SELECT status, COUNT(*) as count FROM features GROUP BY status">
  <BarChart xKey="status" yKey="count" />
</LiveValue>

## Table Example

<LiveValue query="SELECT id, name, email, status, role FROM users LIMIT 10" display="table" />

## Form Example

<LiveAction sql="UPDATE tasks SET status = :status WHERE id = 1">
  <Select name="status" options={[{ value: "todo", label: "To Do" }, { value: "done", label: "Done" }]}>Status</Select>
  <Button>Update Task</Button>
</LiveAction>

## Features

- Rich text editing
- Markdown serialization
- Inline LiveValue components
- Charts and data visualization
- Interactive forms with LiveAction
- Tabbed navigation with Tabs/Tab
`;

// Test content for PreviewEditor
const PREVIEW_TEST_CONTENT = {
  tabs: `<Tabs defaultValue="dashboard">
  <Tab value="dashboard" label="Dashboard">Dashboard content with charts and metrics</Tab>
  <Tab value="users" label="Users">User management section</Tab>
  <Tab value="settings" label="Settings">Application settings</Tab>
</Tabs>`,
  chart: `<LiveValue query="SELECT month, sales, revenue, profit FROM monthly_sales">
  <BarChart xKey="month" yKey={["sales", "revenue"]} />
</LiveValue>`,
  inline: `Total users: <LiveValue query="SELECT COUNT(*) as count FROM users" />`,
  table: `<LiveValue query="SELECT id, name, email, status, role FROM users LIMIT 10" display="table" />`,
  mixed: `## Sales Report

Here's our monthly data:

<LiveValue query="SELECT month, sales, revenue, profit FROM monthly_sales">
  <BarChart xKey="month" yKey={["sales", "revenue"]} />
</LiveValue>

Total users in system: <LiveValue query="SELECT COUNT(*) as count FROM users" />
`,
};

function App() {
  const [markdown, setMarkdown] = useState(initialMarkdown);
  const [previewContent, setPreviewContent] = useState<keyof typeof PREVIEW_TEST_CONTENT>("chart");
  const [showPreviewTest, setShowPreviewTest] = useState(false);
  const editorRef = useRef<EditorHandle>(null);

  const handleChange = (md: string) => {
    setMarkdown(md);
  };

  return (
    <div className="sandbox">
      <header className="sandbox-header">
        <h1>@hands/editor Sandbox</h1>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <span className="sandbox-hint">Edit in editor, see markdown output</span>
          <button
            onClick={() => setShowPreviewTest(!showPreviewTest)}
            style={{
              padding: "4px 12px",
              borderRadius: 4,
              border: "1px solid #ccc",
              background: showPreviewTest ? "#007bff" : "#fff",
              color: showPreviewTest ? "#fff" : "#000",
              cursor: "pointer",
            }}
          >
            {showPreviewTest ? "Hide" : "Show"} Preview Test
          </button>
        </div>
      </header>

      {showPreviewTest && (
        <div style={{ padding: 16, borderBottom: "1px solid #eee", background: "#fafafa" }}>
          <div style={{ marginBottom: 8, display: "flex", gap: 8 }}>
            <strong>Preview Test:</strong>
            {(Object.keys(PREVIEW_TEST_CONTENT) as Array<keyof typeof PREVIEW_TEST_CONTENT>).map(
              (key) => (
                <button
                  key={key}
                  onClick={() => setPreviewContent(key)}
                  style={{
                    padding: "2px 8px",
                    borderRadius: 4,
                    border: "1px solid #ccc",
                    background: previewContent === key ? "#007bff" : "#fff",
                    color: previewContent === key ? "#fff" : "#000",
                    cursor: "pointer",
                  }}
                >
                  {key}
                </button>
              ),
            )}
          </div>
          <div style={{ display: "flex", gap: 16 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>MDX Input:</div>
              <pre
                style={{
                  background: "#f0f0f0",
                  padding: 8,
                  borderRadius: 4,
                  fontSize: 11,
                  overflow: "auto",
                  maxHeight: 200,
                }}
              >
                {PREVIEW_TEST_CONTENT[previewContent]}
              </pre>
            </div>
            <div
              style={{
                flex: 1,
                border: "1px solid #ddd",
                borderRadius: 4,
                padding: 8,
                background: "#fff",
              }}
            >
              <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>
                PreviewEditor Output:
              </div>
              <LiveQueryProvider
                useQuery={useMockQuery}
                useMutation={useMockMutation}
                schema={MOCK_SCHEMA}
              >
                <PreviewEditor value={PREVIEW_TEST_CONTENT[previewContent]} />
              </LiveQueryProvider>
            </div>
          </div>
        </div>
      )}

      <main className="sandbox-main">
        <div className="editor-container">
          <div className="panel-header">
            <span>Editor</span>
            <span className="panel-hint">Type @ to trigger AI autocomplete</span>
          </div>
          <EditorProvider trpc={mockTrpc}>
            <LiveQueryProvider
              useQuery={useMockQuery}
              useMutation={useMockMutation}
              schema={MOCK_SCHEMA}
            >
              <Editor
                ref={editorRef}
                value={markdown}
                onChange={handleChange}
                placeholder="Start typing..."
                autoFocus
              />
            </LiveQueryProvider>
          </EditorProvider>
        </div>

        <aside className="markdown-panel">
          <div className="panel-header">
            <span>Markdown Output</span>
          </div>
          <textarea className="markdown-textarea" value={markdown} readOnly spellCheck={false} />
        </aside>
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
