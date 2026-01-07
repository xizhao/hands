/**
 * Lightweight Spinner/LoadingState Components
 *
 * WHY THIS FILE EXISTS:
 * These are minimal copies of spinner components from @hands/app.
 * We can't import from @hands/app in App.tsx because it would pull in
 * the entire package (16MB+) due to barrel exports, defeating code splitting.
 *
 * This inline SVG spinner avoids external dependencies (no Lucide icons).
 * The full-featured Spinner with size variants is in @hands/app and loads
 * with WorkbookShell when needed.
 */

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`animate-spin h-5 w-5 text-muted-foreground ${className}`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

export function LoadingState({ className = "" }: { className?: string }) {
  return (
    <div className={`h-full flex items-center justify-center ${className}`}>
      <Spinner />
    </div>
  );
}
