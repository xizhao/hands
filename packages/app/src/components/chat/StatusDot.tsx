/**
 * StatusDot - Session status indicator
 *
 * Shows visual status of a session:
 * - busy: Pulsing green dot
 * - error: Red dot
 * - null: Nothing
 */

export type SessionStatus = "busy" | "error" | null;

interface StatusDotProps {
  status: SessionStatus;
  className?: string;
}

export function StatusDot({ status, className = "" }: StatusDotProps) {
  if (!status) return null;

  if (status === "busy") {
    return (
      <span className={`relative flex h-2 w-2 ${className}`}>
        <span className="animate-ping absolute h-full w-full rounded-full bg-emerald-400 opacity-75" />
        <span className="relative rounded-full h-2 w-2 bg-emerald-500" />
      </span>
    );
  }

  return <span className={`h-2 w-2 rounded-full bg-red-500 ${className}`} />;
}
