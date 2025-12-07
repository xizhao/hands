import { create } from "zustand";

export interface BackgroundTask {
  id: string; // session ID
  type: "import" | "export" | "build";
  title: string;
  status: "running" | "completed" | "error";
  progress?: string; // Current activity description
  startedAt: number;
  completedAt?: number;
  error?: string;
}

interface BackgroundState {
  tasks: Record<string, BackgroundTask>;
  addTask: (task: BackgroundTask) => void;
  updateTask: (id: string, updates: Partial<BackgroundTask>) => void;
  removeTask: (id: string) => void;
  getRunningTasks: () => BackgroundTask[];
}

export const useBackgroundStore = create<BackgroundState>((set, get) => ({
  tasks: {},

  addTask: (task) =>
    set((state) => ({
      tasks: { ...state.tasks, [task.id]: task },
    })),

  updateTask: (id, updates) =>
    set((state) => ({
      tasks: state.tasks[id]
        ? { ...state.tasks, [id]: { ...state.tasks[id], ...updates } }
        : state.tasks,
    })),

  removeTask: (id) =>
    set((state) => {
      const { [id]: _, ...rest } = state.tasks;
      return { tasks: rest };
    }),

  getRunningTasks: () =>
    Object.values(get().tasks).filter((t) => t.status === "running"),
}));
