/**
 * Change Log Component
 *
 * Shows recent database changes with operation indicators.
 */

import { cn } from "@/lib/utils";
import { useRecentChanges, formatTimeAgo } from "@/store/db-hooks";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ChangeLogProps {
  onSelectTable: (name: string) => void;
}

export function ChangeLog({ onSelectTable }: ChangeLogProps) {
  const changes = useRecentChanges(50);

  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-2 border-b border-zinc-800">
        <span className="text-xs font-medium text-zinc-400">Recent Changes</span>
      </div>

      <ScrollArea className="flex-1">
        <div className="py-1">
          {changes.length === 0 ? (
            <div className="px-3 py-4 text-xs text-zinc-500 text-center">
              No changes yet
            </div>
          ) : (
            changes.map((change) => (
              <button
                key={change.id}
                onClick={() => onSelectTable(change.table)}
                className="w-full px-3 py-1.5 text-left hover:bg-zinc-800/50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <OperationDot operation={change.op} />
                  <span className="text-[11px] font-medium text-zinc-300 truncate flex-1">
                    {change.table}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-0.5 text-[10px] text-zinc-500">
                  <span
                    className={cn(
                      change.op === "INSERT" && "text-green-400",
                      change.op === "UPDATE" && "text-yellow-400",
                      change.op === "DELETE" && "text-red-400"
                    )}
                  >
                    {change.op}
                  </span>
                  {change.rowId && (
                    <span className="truncate">#{change.rowId}</span>
                  )}
                  <span className="ml-auto">{formatTimeAgo(change.ts)}</span>
                </div>
              </button>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function OperationDot({ operation }: { operation: "INSERT" | "UPDATE" | "DELETE" }) {
  return (
    <span
      className={cn(
        "h-1.5 w-1.5 rounded-full shrink-0",
        operation === "INSERT" && "bg-green-500",
        operation === "UPDATE" && "bg-yellow-500",
        operation === "DELETE" && "bg-red-500"
      )}
    />
  );
}
