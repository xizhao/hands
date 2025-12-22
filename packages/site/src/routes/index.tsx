import { Demo } from "../components/Demo";
import { useTheme } from "../hooks/useTheme";
import { SiteEditorProvider } from "../providers/SiteEditorProvider";

export default function IndexPage() {
  const { theme, toggleTheme } = useTheme();

  return (
    <SiteEditorProvider>
      <div className="min-h-screen bg-background">
        {/* Floating Toolbar */}
        <nav className="fixed top-4 left-1/2 -translate-x-1/2 z-50">
          <div className="flex items-center gap-1 px-2 py-1.5 bg-zinc-950 dark:bg-zinc-900 rounded-xl shadow-lg shadow-black/25 border border-zinc-800 dark:border-zinc-700">
            <div className="flex items-center gap-2 px-3 py-1.5 text-white">
              <HandsLogo className="w-4 h-4" />
              <span className="text-sm font-medium">Hands</span>
            </div>
            <div className="w-px h-4 bg-zinc-700" />
            <a
              href="https://github.com/hands"
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 text-sm text-zinc-400 hover:text-white transition-colors"
            >
              GitHub
            </a>
            <button
              onClick={toggleTheme}
              className="p-2 rounded-full hover:bg-zinc-700 transition-colors text-zinc-400 hover:text-white"
              aria-label="Toggle theme"
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
        </nav>

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
            <Demo />
          </div>
        </section>

        {/* Feature Cards */}
        <section className="px-6 pb-24">
          <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-6 rounded-xl bg-card border border-border">
              <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center mb-4">
                <DatabaseIcon className="w-5 h-5 text-foreground" />
              </div>
              <h3 className="font-semibold text-foreground mb-2">
                SQL + Markdown
              </h3>
              <p className="text-sm text-muted-foreground">
                Write queries inline. Your data stays live and always up to
                date.
              </p>
            </div>
            <div className="p-6 rounded-xl bg-card border border-border">
              <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center mb-4">
                <ChartIcon className="w-5 h-5 text-foreground" />
              </div>
              <h3 className="font-semibold text-foreground mb-2">
                Charts & Tables
              </h3>
              <p className="text-sm text-muted-foreground">
                Visualize results with built-in components. No configuration
                needed.
              </p>
            </div>
            <div className="p-6 rounded-xl bg-card border border-border">
              <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center mb-4">
                <BoltIcon className="w-5 h-5 text-foreground" />
              </div>
              <h3 className="font-semibold text-foreground mb-2">
                Instant Preview
              </h3>
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

function HandsLogo({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2" />
      <path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2" />
      <path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8" />
      <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
    </svg>
  );
}
