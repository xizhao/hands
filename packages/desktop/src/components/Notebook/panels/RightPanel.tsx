/**
 * RightPanel - Overlay sliding panel for Sources, Blocks, and Settings
 * Darkens the app and slides over on top of everything including chat
 */

import { useRightPanel } from "@/hooks/useNavState";
import { cn } from "@/lib/utils";
import { X } from "@phosphor-icons/react";
import { SourcesPanel } from "./SourcesPanel";
import { DatabasePanel } from "./DatabasePanel";
import { BlocksPanel } from "./BlocksPanel";
import { SettingsPanel } from "./SettingsPanel";
import { AlertsPanel } from "./AlertsPanel";
import { AnimatePresence, motion } from "framer-motion";

export function RightPanel() {
  const { panel: rightPanel, setPanel: setRightPanel } = useRightPanel();

  const panelTitle = rightPanel ? {
    sources: "Sources",
    database: "Database",
    blocks: "Blocks",
    settings: "Settings",
    alerts: "Alerts",
  }[rightPanel] : "";

  return (
    <AnimatePresence>
      {rightPanel && (
        <>
          {/* Backdrop overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/50 z-[60]"
            onClick={() => setRightPanel(null)}
          />

          {/* Sliding panel */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className={cn(
              "fixed top-0 right-0 bottom-0 w-[320px] z-[70]",
              "flex flex-col bg-background border-l border-border shadow-2xl"
            )}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <span className="text-sm font-medium">{panelTitle}</span>
              <button
                onClick={() => setRightPanel(null)}
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <X weight="bold" className="h-4 w-4" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
              {rightPanel === "sources" && <SourcesPanel />}
              {rightPanel === "database" && <DatabasePanel />}
              {rightPanel === "blocks" && <BlocksPanel />}
              {rightPanel === "settings" && <SettingsPanel />}
              {rightPanel === "alerts" && <AlertsPanel />}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
