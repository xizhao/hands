/**
 * Database Browser Panel
 *
 * Slide-in panel for browsing database tables and viewing real-time changes.
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Database, X, History } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDbSync, useTables } from "@/store/db-hooks";
import { TableList } from "./TableList";
import { DataGrid } from "./DataGrid";
import { ChangeLog } from "./ChangeLog";

interface DbBrowserProps {
  isOpen: boolean;
  onClose: () => void;
}

export function DbBrowser({ isOpen, onClose }: DbBrowserProps) {
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [showChangeLog, setShowChangeLog] = useState(true);

  // Initialize DB change sync
  useDbSync();

  const { data: tables = [], isLoading } = useTables();

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className={cn(
            "fixed right-0 top-0 bottom-0 w-[600px] z-50",
            "bg-zinc-900/95 backdrop-blur-xl",
            "border-l border-zinc-800 shadow-2xl",
            "flex flex-col"
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-blue-400" />
              <span className="text-sm font-medium text-zinc-200">Database</span>
              <span className="text-xs text-zinc-500">
                {tables.length} table{tables.length !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="flex items-center gap-1">
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
              <button
                onClick={onClose}
                className="p-1.5 rounded-md hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Main content */}
          <div className="flex-1 flex overflow-hidden">
            {/* Change log (collapsible) */}
            <AnimatePresence>
              {showChangeLog && (
                <motion.div
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: 180, opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="border-r border-zinc-800 overflow-hidden shrink-0"
                >
                  <ChangeLog onSelectTable={setSelectedTable} />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Table list */}
            <div className="w-44 border-r border-zinc-800 overflow-y-auto shrink-0">
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
                <div className="flex items-center justify-center h-full text-zinc-500 text-sm">
                  Select a table to view data
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
