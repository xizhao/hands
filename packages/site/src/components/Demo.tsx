import { Editor } from "@hands/editor";
import { useState } from "react";

const DASHBOARD_MDX = `# Sales Dashboard

<Columns>
  <LiveValue query="SELECT SUM(amount) as value FROM orders WHERE status = 'completed'" label="Revenue" format="currency" />
  <LiveValue query="SELECT COUNT(*) as value FROM orders WHERE created_at > date('now', '-7 days')" label="Orders (7d)" />
  <LiveValue query="SELECT COUNT(*) as value FROM users" label="Customers" />
  <LiveValue query="SELECT ROUND(AVG(amount), 2) as value FROM orders" label="Avg Order" format="currency" />
</Columns>

## Revenue by Product Category

<LiveValue query="SELECT p.category, SUM(o.amount) as revenue FROM orders o JOIN products p ON o.product_id = p.id GROUP BY p.category ORDER BY revenue DESC">
  <BarChart xKey="category" yKey="revenue" />
</LiveValue>

## Recent Orders

<LiveValue query="SELECT o.id, u.name as customer, p.name as product, o.amount, o.status, o.created_at FROM orders o JOIN users u ON o.user_id = u.id JOIN products p ON o.product_id = p.id ORDER BY o.created_at DESC LIMIT 8">
  <DataTable columns={["id", "customer", "product", "amount", "status"]} />
</LiveValue>
`;

const TUTORIALS_MDX = `# Hands Component Reference

## The @-Menu

Type \`@\` anywhere to trigger AI-powered autocomplete:

- Type a prompt like \`@show revenue by month\`
- See ghost text preview as you type
- Press **Tab** to accept, **Escape** to cancel

---

## View Components

### LiveValue
Display live SQL results. Auto-selects format: inline (1×1), list (N×1), or table (N×M).

\`\`\`mdx
<LiveValue sql="SELECT count(*) FROM users" />
<LiveValue sql="SELECT * FROM tasks" display="table" />
\`\`\`

### Charts
Visualize data with LineChart, BarChart, AreaChart, or PieChart:

\`\`\`mdx
<LiveValue sql="SELECT category, SUM(amount) as total FROM orders GROUP BY category">
  <BarChart xKey="category" yKey="total" />
</LiveValue>
\`\`\`

### Metric
KPI display with optional change indicator:

\`\`\`mdx
<Metric label="Revenue" value={50000} prefix="$" change={12.5} />
\`\`\`

---

## Action Components

### LiveAction
Form container that executes SQL on submit with \`{{field}}\` bindings:

\`\`\`mdx
<LiveAction sql="UPDATE tasks SET status = {{status}} WHERE id = 1">
  <ActionSelect name="status" options={[{value: "done", label: "Done"}]} />
  <ActionButton>Update</ActionButton>
</LiveAction>
\`\`\`

---

## Data Components

### DataGrid
Editable spreadsheet with sorting, search, and keyboard navigation.

### Kanban
Drag-and-drop board grouped by a column.
`;

type TabId = "dashboard" | "tutorial";

const TABS: { id: TabId; label: string }[] = [
  { id: "dashboard", label: "Dashboard.mdx" },
  { id: "tutorial", label: "Tutorial.mdx" },
];

export function Demo() {
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const [contents, setContents] = useState<Record<TabId, string>>({
    dashboard: DASHBOARD_MDX,
    tutorial: TUTORIALS_MDX,
  });

  const handleChange = (value: string) => {
    setContents((prev) => ({ ...prev, [activeTab]: value }));
  };

  return (
    <div className="rounded-xl overflow-hidden shadow-2xl shadow-black/20 dark:shadow-black/50 border border-border">
      {/* Tab Bar */}
      <div className="h-10 bg-muted flex items-end px-2 gap-0.5">
        {/* File Tabs */}
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-3 py-2 rounded-t-lg text-xs font-medium transition-colors ${
              activeTab === tab.id
                ? "bg-background/95 backdrop-blur text-foreground border-t border-x border-border"
                : "text-muted-foreground hover:bg-muted/80"
            }`}
          >
            <FileIcon className="w-3.5 h-3.5" />
            <span>{tab.label}</span>
            {activeTab === tab.id && (
              <span className="text-muted-foreground hover:text-foreground">×</span>
            )}
          </button>
        ))}
        {/* Table Tabs */}
        {["users", "products", "orders"].map((table) => (
          <div
            key={table}
            className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted/80 rounded-t-lg cursor-pointer"
          >
            <TableIcon className="w-3.5 h-3.5" />
            <span>{table}</span>
          </div>
        ))}
      </div>

      {/* Editor Content - zoomed out for preview effect */}
      <div className="h-[500px] overflow-hidden">
        <div className="origin-top-left scale-[0.85] w-[117.6%] h-[117.6%]">
          <Editor value={contents[activeTab]} onChange={handleChange} className="h-full" />
        </div>
      </div>
    </div>
  );
}

function FileIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
    </svg>
  );
}

function TableIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M12 3v18" />
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M3 9h18" />
      <path d="M3 15h18" />
    </svg>
  );
}
