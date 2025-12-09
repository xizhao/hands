import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, RefreshCw, Database, Globe, FileJson } from "lucide-react";

export function SourcesPanel() {
  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h2 className="text-sm font-medium">Data Sources</h2>
        <button className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
          <Plus className="h-3.5 w-3.5" />
          Add Source
        </button>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-3">
          {/* Placeholder for data sources */}
          <div className="text-center py-12 text-muted-foreground">
            <Database className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No data sources configured</p>
            <p className="text-xs mt-1">Add a source to start syncing data</p>
          </div>

          {/* Example source cards - will be dynamic */}
          {/* <SourceCard
            name="Stripe API"
            type="http-json"
            lastSync="2 hours ago"
            status="synced"
          /> */}
        </div>
      </ScrollArea>
    </div>
  );
}

interface SourceCardProps {
  name: string;
  type: "http-json" | "postgres" | "csv" | "parquet";
  lastSync: string;
  status: "synced" | "syncing" | "error";
}

export function SourceCard({ name, type, lastSync, status }: SourceCardProps) {
  const icons = {
    "http-json": Globe,
    postgres: Database,
    csv: FileJson,
    parquet: FileJson,
  };
  const Icon = icons[type];

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors cursor-pointer">
      <div className="p-2 rounded-md bg-muted">
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{name}</p>
        <p className="text-xs text-muted-foreground">Last sync: {lastSync}</p>
      </div>
      <div className="flex items-center gap-2">
        {status === "syncing" && (
          <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
        )}
        <div
          className={`h-2 w-2 rounded-full ${
            status === "synced" ? "bg-green-500" :
            status === "syncing" ? "bg-yellow-500" :
            "bg-red-500"
          }`}
        />
      </div>
    </div>
  );
}
