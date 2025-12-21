import { Editor } from "@hands/editor";
import { useState } from "react";
import { useTheme } from "../hooks/useTheme";
import { SiteEditorProvider } from "../providers/SiteEditorProvider";

const SAMPLE_MDX = `# Dashboard

<LiveValue query="SELECT COUNT(*) as count FROM users" label="Total Users" />

## Orders by Status

<LiveValue query="SELECT status, COUNT(*) as count FROM orders GROUP BY status">
  <BarChart xKey="status" yKey="count" />
</LiveValue>

## Recent Orders

<LiveValue query="SELECT o.id, u.name as customer, p.name as product, o.amount, o.status FROM orders o JOIN users u ON o.user_id = u.id JOIN products p ON o.product_id = p.id ORDER BY o.id DESC LIMIT 5">
  <DataTable columns={["id", "customer", "product", "amount", "status"]} />
</LiveValue>
`;

export default function IndexPage() {
  const [mdx, setMdx] = useState(SAMPLE_MDX);
  const { theme, toggleTheme } = useTheme();

  return (
    <SiteEditorProvider>
      <div className="min-h-screen bg-background">
        {/* Minimal Header */}
        <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-sm border-b border-border">
          <div className="container mx-auto px-6 py-4 flex items-center justify-between">
            <span className="text-lg font-semibold text-foreground">Hands</span>
            <div className="flex items-center gap-4">
              <a
                href="https://github.com/hands"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                GitHub
              </a>
              <button
                onClick={toggleTheme}
                className="p-2 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                aria-label="Toggle theme"
                title={
                  theme === "system"
                    ? "System"
                    : theme === "dark"
                    ? "Dark"
                    : "Light"
                }
              >
                {theme === "system" ? (
                  <MonitorIcon className="w-4 h-4" />
                ) : theme === "dark" ? (
                  <MoonIcon className="w-4 h-4" />
                ) : (
                  <SunIcon className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>
        </header>

        {/* Hero Section */}
        <section className="pt-32 pb-16 px-6">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-5xl md:text-6xl font-bold tracking-tight text-foreground mb-6">
              Write Apps like Docs
            </h1>
            <p className="text-xl text-muted-foreground max-w-xl mx-auto">
              Effortlessly write charts and production workflows on top of your
              live data.
            </p>
          </div>
        </section>

        {/* Browser Frame */}
        <section className="px-6 pb-24">
          <div className="max-w-3xl mx-auto">
            <div className="rounded-xl overflow-hidden shadow-2xl shadow-black/20 dark:shadow-black/50 border border-border">
              {/* Tab Bar */}
              <div className="h-10 bg-muted flex items-end px-2 gap-0.5">
                {/* Active Tab */}
                <div className="flex items-center gap-2 px-3 py-2 bg-background/95 backdrop-blur rounded-t-lg text-xs font-medium text-foreground border-t border-x border-border">
                  <FileIcon className="w-3.5 h-3.5" />
                  <span>Dashboard.mdx</span>
                  <span className="text-muted-foreground hover:text-foreground cursor-pointer">
                    ×
                  </span>
                </div>
                {/* Table Tabs */}
                {["users", "products", "orders", "tasks"].map((table) => (
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
                  <Editor value={mdx} onChange={setMdx} className="h-full" />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Feature Cards */}
        <section className="px-6 pb-24">
          <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-6 rounded-xl bg-card border border-border">
              <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center mb-4">
                <DatabaseIcon className="w-5 h-5 text-foreground" />
              </div>
              <h3 className="font-semibold text-foreground mb-2">SQL + Markdown</h3>
              <p className="text-sm text-muted-foreground">
                Write queries inline. Your data stays live and always up to date.
              </p>
            </div>
            <div className="p-6 rounded-xl bg-card border border-border">
              <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center mb-4">
                <ChartIcon className="w-5 h-5 text-foreground" />
              </div>
              <h3 className="font-semibold text-foreground mb-2">Charts & Tables</h3>
              <p className="text-sm text-muted-foreground">
                Visualize results with built-in components. No configuration needed.
              </p>
            </div>
            <div className="p-6 rounded-xl bg-card border border-border">
              <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center mb-4">
                <BoltIcon className="w-5 h-5 text-foreground" />
              </div>
              <h3 className="font-semibold text-foreground mb-2">Instant Preview</h3>
              <p className="text-sm text-muted-foreground">
                See changes as you type. What you write is what you get.
              </p>
            </div>
          </div>
        </section>
      </div>
    </SiteEditorProvider>
  );
}

function SunIcon({ className }: { className?: string }) {
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
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="m4.93 4.93 1.41 1.41" />
      <path d="m17.66 17.66 1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="m6.34 17.66-1.41 1.41" />
      <path d="m19.07 4.93-1.41 1.41" />
    </svg>
  );
}

function MoonIcon({ className }: { className?: string }) {
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
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  );
}

function MonitorIcon({ className }: { className?: string }) {
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
      <rect width="20" height="14" x="2" y="3" rx="2" />
      <line x1="8" x2="16" y1="21" y2="21" />
      <line x1="12" x2="12" y1="17" y2="21" />
    </svg>
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

function DatabaseIcon({ className }: { className?: string }) {
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
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M3 5v14a9 3 0 0 0 18 0V5" />
      <path d="M3 12a9 3 0 0 0 18 0" />
    </svg>
  );
}

function ChartIcon({ className }: { className?: string }) {
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
      <path d="M3 3v18h18" />
      <path d="m19 9-5 5-4-4-3 3" />
    </svg>
  );
}

function BoltIcon({ className }: { className?: string }) {
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
      <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  );
}
