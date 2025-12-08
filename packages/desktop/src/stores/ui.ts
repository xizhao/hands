import { create } from "zustand";
import { persist } from "zustand/middleware";
import { clearAllCollections } from "@/store";

interface UIState {
  // Active workbook context
  activeWorkbookId: string | null;
  activeWorkbookDirectory: string | null;
  setActiveWorkbook: (id: string | null, directory: string | null) => void;
  // Active session within workbook
  activeSessionId: string | null;
  setActiveSession: (id: string | null) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
      activeWorkbookId: null,
      activeWorkbookDirectory: null,
      setActiveWorkbook: (id, directory) => {
        const currentId = get().activeWorkbookId;
        // Only clear if switching to a different workbook
        if (currentId && currentId !== id) {
          // Clear all TanStack DB collections when switching workbooks
          clearAllCollections();
        }
        set({ activeWorkbookId: id, activeWorkbookDirectory: directory, activeSessionId: null });
      },
      activeSessionId: null,
      setActiveSession: (id) => set({ activeSessionId: id }),
    }),
    {
      name: "hands-ui-state",
      partialize: (state) => ({
        activeWorkbookId: state.activeWorkbookId,
        activeWorkbookDirectory: state.activeWorkbookDirectory,
      }),
    }
  )
);
