import { create } from "zustand";
import { queryClient } from "@/App";

type TabId = "sources" | "data" | "insights" | "preview";
type RightPanelId = "sources" | "database" | "blocks" | "settings" | "alerts" | null;

// Pending file attachment for chat
export interface PendingAttachment {
  type: "file";
  file: File;
  name: string;
}

// Pending block attachment for chat (block://<id>)
export interface PendingBlockAttachment {
  type: "block";
  blockId: string;
  name: string;
  // Optional error context for "Fix with Hands" action - triggers auto-submit
  errorContext?: string;
}

interface UIState {
  // Active workbook context (not persisted - Tauri is source of truth)
  activeWorkbookId: string | null;
  activeWorkbookDirectory: string | null;
  setActiveWorkbook: (id: string | null, directory: string | null) => void;
  // Runtime port for the active workbook (for db-browser SSE)
  runtimePort: number | null;
  setRuntimePort: (port: number | null) => void;
  // Active session within workbook
  activeSessionId: string | null;
  setActiveSession: (id: string | null) => void;
  // Active page within workbook (null = no page selected, show full sidebar)
  activePageId: string | null;
  setActivePage: (id: string | null) => void;
  // Active tab in notebook view
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;
  // Right panel state
  rightPanel: RightPanelId;
  setRightPanel: (panel: RightPanelId) => void;
  toggleRightPanel: (panel: Exclude<RightPanelId, null>) => void;
  // Pending attachment for chat (file or block)
  pendingAttachment: PendingAttachment | PendingBlockAttachment | null;
  setPendingAttachment: (attachment: PendingAttachment | PendingBlockAttachment | null) => void;
  // Auto-submit trigger for file drops
  autoSubmitPending: boolean;
  setAutoSubmitPending: (pending: boolean) => void;
  // Chat thread expanded state
  chatExpanded: boolean;
  setChatExpanded: (expanded: boolean) => void;
}

export const useUIStore = create<UIState>()((set, get) => ({
  activeWorkbookId: null,
  activeWorkbookDirectory: null,
  setActiveWorkbook: (id, directory) => {
    const currentId = get().activeWorkbookId;
    // Only clear if switching to a different workbook
    if (currentId && currentId !== id) {
      // Clear React Query cache when switching workbooks
      queryClient.clear();
    }
    set({ activeWorkbookId: id, activeWorkbookDirectory: directory, activeSessionId: null, runtimePort: null });
  },
  runtimePort: null,
  setRuntimePort: (port) => set({ runtimePort: port }),
  activeSessionId: null,
  setActiveSession: (id) => set({ activeSessionId: id }),
  activePageId: null,
  setActivePage: (id) => set({ activePageId: id }),
  activeTab: "preview",
  setActiveTab: (tab) => set({ activeTab: tab }),
  rightPanel: null,
  setRightPanel: (panel) => set({ rightPanel: panel }),
  toggleRightPanel: (panel) => set((state) => ({
    rightPanel: state.rightPanel === panel ? null : panel
  })),
  pendingAttachment: null,
  setPendingAttachment: (attachment) => set({ pendingAttachment: attachment }),
  autoSubmitPending: false,
  setAutoSubmitPending: (pending) => set({ autoSubmitPending: pending }),
  chatExpanded: false,
  setChatExpanded: (expanded) => set({ chatExpanded: expanded }),
}));
