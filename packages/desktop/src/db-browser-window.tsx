/**
 * Database Browser Window
 *
 * Standalone window for browsing database tables and viewing real-time changes.
 * Opened via Tauri command from the main app.
 */

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Database, History, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { TableList } from "@/components/DbBrowser/TableList";
import { DataGrid } from "@/components/DbBrowser/DataGrid";
import { ChangeLog } from "@/components/DbBrowser/ChangeLog";
import { useDbSync, useTables } from "@/store/db-hooks";
import { DbContextProvider, useRuntimePort } from "@/store/db-context";
import { refreshTriggers } from "@/store/db-browser";
import "./index.css";

// Dedicated query client for this window
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5000,
      refetchOnWindowFocus: true,
    },
  },
});

function DbBrowserContent() {
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [showChangeLog, setShowChangeLog] = useState(true);
  const runtimePort = useRuntimePort();

  // Initialize DB change sync
  useDbSync();

  const { data: tables = [], isLoading, refetch } = useTables();

  const handleRefreshTriggers = async () => {
    if (runtimePort) {
      try {
        await refreshTriggers(runtimePort);
        refetch();
      } catch (err) {
        console.error("Failed to refresh triggers:", err);
      }
    }
  };

  return (
    <div className="h-screen flex flex-col bg-zinc-900 text-zinc-100">
      {/* Title bar / Header */}
      <div
        data-tauri-drag-region
        className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-900/80 backdrop-blur"
      >
        <div className="flex items-center gap-2" data-tauri-drag-region>
          <Database className="h-4 w-4 text-blue-400" />
          <span className="text-sm font-medium">Database Browser</span>
          <span className="text-xs text-zinc-500">
            {tables.length} table{tables.length !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleRefreshTriggers}
            className="p-1.5 rounded-md hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors"
            title="Refresh triggers"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <button
            onClick={() => setShowChangeLog(!showChangeLog)}
            className={cn(
              "p-1.5 rounded-md transition-colors",
              showChangeLog
                ? "bg-zinc-700 text-zinc-200"
                : "hover:bg-zinc-800 text-zinc-500"
            )}
            title="Toggle change log"
          >
            <History className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Change log (collapsible) */}
        {showChangeLog && (
          <div className="w-48 border-r border-zinc-800 overflow-hidden shrink-0">
            <ChangeLog onSelectTable={setSelectedTable} />
          </div>
        )}

        {/* Table list */}
        <div className="w-48 border-r border-zinc-800 overflow-y-auto shrink-0">
          <TableList
            tables={tables}
            selectedTable={selectedTable}
            onSelectTable={setSelectedTable}
            isLoading={isLoading}
          />
        </div>

        {/* Data grid */}
        <div className="flex-1 overflow-hidden">
          {selectedTable ? (
            <DataGrid tableName={selectedTable} />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-zinc-500 text-sm gap-2">
              <Database className="h-8 w-8 text-zinc-600" />
              <span>Select a table to view data</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function DbBrowserWindow() {
  return (
    <QueryClientProvider client={queryClient}>
      <DbContextProvider>
        <DbBrowserContent />
      </DbContextProvider>
    </QueryClientProvider>
  );
}
