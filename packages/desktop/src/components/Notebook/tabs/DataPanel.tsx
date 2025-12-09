import { useState } from "react";
import { TableList } from "@/components/DbBrowser/TableList";
import { DataGrid } from "@/components/DbBrowser/DataGrid";
import { ChangeLog } from "@/components/DbBrowser/ChangeLog";
import { useDbSync, useTables } from "@/store/db-hooks";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function DataPanel() {
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [showChangeLog, setShowChangeLog] = useState(true);

  // Initialize SSE subscription for DB changes
  useDbSync();

  const { data: tables = [], isLoading } = useTables();

  return (
    <div className="h-full flex">
      {/* Change log sidebar */}
      {showChangeLog && (
        <div className="w-48 border-r border-border flex flex-col">
          <div className="p-2 border-b border-border flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Changes</span>
            <button
              onClick={() => setShowChangeLog(false)}
              className="p-1 hover:bg-muted rounded"
            >
              <ChevronLeft className="h-3 w-3" />
            </button>
          </div>
          <div className="flex-1 overflow-hidden">
            <ChangeLog onSelectTable={setSelectedTable} />
          </div>
        </div>
      )}

      {/* Table list */}
      <div className="w-48 border-r border-border flex flex-col">
        <div className="p-2 border-b border-border flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">Tables</span>
          {!showChangeLog && (
            <button
              onClick={() => setShowChangeLog(true)}
              className="p-1 hover:bg-muted rounded"
            >
              <ChevronRight className="h-3 w-3" />
            </button>
          )}
        </div>
        <div className="flex-1 overflow-hidden">
          <TableList
            tables={tables}
            selectedTable={selectedTable}
            onSelectTable={setSelectedTable}
            isLoading={isLoading}
          />
        </div>
      </div>

      {/* Data grid */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedTable ? (
          <DataGrid tableName={selectedTable} />
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <p className="text-sm">Select a table to view data</p>
          </div>
        )}
      </div>
    </div>
  );
}
