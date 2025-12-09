import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, BarChart3, Table2, FileText } from "lucide-react";

export function InsightsPanel() {
  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h2 className="text-sm font-medium">Saved Insights</h2>
        <button className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
          <Plus className="h-3.5 w-3.5" />
          New Insight
        </button>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-3">
          {/* Placeholder for insights */}
          <div className="text-center py-12 text-muted-foreground">
            <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No saved insights</p>
            <p className="text-xs mt-1">Create queries and charts to save them here</p>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

interface InsightCardProps {
  name: string;
  type: "chart" | "table" | "query";
  description?: string;
}

export function InsightCard({ name, type, description }: InsightCardProps) {
  const icons = {
    chart: BarChart3,
    table: Table2,
    query: FileText,
  };
  const Icon = icons[type];

  return (
    <div className="flex items-start gap-3 p-3 rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors cursor-pointer">
      <div className="p-2 rounded-md bg-muted">
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{name}</p>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{description}</p>
        )}
      </div>
    </div>
  );
}
