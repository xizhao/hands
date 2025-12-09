/**
 * BlocksPanel - Shows charts and insights
 */

import { useUIStore } from "@/stores/ui";
import { useDevServerRoutes } from "@/hooks/useWorkbook";
import { SquaresFour, CaretRight, Sparkle } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

export function BlocksPanel() {
  const { activeWorkbookId } = useUIStore();
  const { data: routes, isLoading } = useDevServerRoutes(activeWorkbookId);

  const charts = routes?.charts ?? [];

  if (isLoading) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        Loading blocks...
      </div>
    );
  }

  if (charts.length === 0) {
    return (
      <div className="p-4">
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <SquaresFour weight="duotone" className="h-8 w-8 text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground">No blocks yet</p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            Create charts and insights in your workbook
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-2">
      <div className="space-y-1">
        {charts.map((chart) => (
          <button
            key={chart.id}
            className={cn(
              "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left",
              "text-sm text-foreground hover:bg-accent transition-colors"
            )}
          >
            <Sparkle weight="duotone" className="h-4 w-4 text-purple-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="truncate">{chart.title}</div>
              {chart.description && (
                <div className="text-xs text-muted-foreground truncate">
                  {chart.description}
                </div>
              )}
            </div>
            <span className="text-xs text-muted-foreground shrink-0">
              {chart.chart_type}
            </span>
            <CaretRight weight="bold" className="h-3 w-3 text-muted-foreground/50 shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
}
