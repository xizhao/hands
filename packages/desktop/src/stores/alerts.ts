/**
 * Alerts Store - Zustand store for tracking editor runtime errors
 *
 * Stores runtime errors from the editor iframe for display in an alerts panel.
 * HTTP and mutation errors are shown as Sonner toasts instead.
 */

import { create } from "zustand";

export type AlertCategory = "runtime" | "http" | "mutation";

export interface Alert {
  id: string;
  category: AlertCategory;
  message: string;
  details?: string;
  stack?: string;
  blockId?: string;
  timestamp: number;
  dismissed: boolean;
}

interface AlertsState {
  alerts: Alert[];
  addAlert: (alert: Omit<Alert, "dismissed">) => void;
  dismissAlert: (id: string) => void;
  clearAlerts: () => void;
  clearDismissed: () => void;
}

export const useAlertsStore = create<AlertsState>((set) => ({
  alerts: [],

  addAlert: (alert) =>
    set((state) => ({
      alerts: [
        { ...alert, dismissed: false },
        ...state.alerts.slice(0, 99), // Keep max 100 alerts
      ],
    })),

  dismissAlert: (id) =>
    set((state) => ({
      alerts: state.alerts.map((a) =>
        a.id === id ? { ...a, dismissed: true } : a
      ),
    })),

  clearAlerts: () => set({ alerts: [] }),

  clearDismissed: () =>
    set((state) => ({
      alerts: state.alerts.filter((a) => !a.dismissed),
    })),
}));

// Selector for active (non-dismissed) alerts
export const selectActiveAlerts = (state: AlertsState) =>
  state.alerts.filter((a) => !a.dismissed);

// Selector for alert count
export const selectAlertCount = (state: AlertsState) =>
  state.alerts.filter((a) => !a.dismissed).length;
