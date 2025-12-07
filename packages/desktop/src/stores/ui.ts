import { create } from "zustand";
import { persist } from "zustand/middleware";

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
    (set) => ({
      activeWorkbookId: null,
      activeWorkbookDirectory: null,
      setActiveWorkbook: (id, directory) =>
        set({ activeWorkbookId: id, activeWorkbookDirectory: directory, activeSessionId: null }),
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
