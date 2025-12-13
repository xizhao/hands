/**
 * Sources Management Hook
 *
 * Sources come from manifest.sources[] - no separate endpoint needed.
 * Runtime only executes sync - no history/progress tracking here.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { useBackgroundTask } from "@/hooks/useBackgroundTask";
import {
  useManifest,
  useRuntimePort,
  useRuntimeState,
  type WorkbookManifest,
} from "@/hooks/useRuntimeState";

// Extract source type from manifest
type WorkbookSource = NonNullable<WorkbookManifest["sources"]>[number];

// Re-export for convenience
export type Source = WorkbookSource;

// Available source from registry
export interface AvailableSource {
  name: string;
  title: string;
  description: string;
  secrets: string[];
  streams: string[];
  schedule?: string;
  icon?: string;
}

// Log entry from sync
export interface LogEntry {
  timestamp: number;
  level: "info" | "warn" | "error" | "debug";
  message: string;
}

// Sync result from runtime
export interface SyncResult {
  success: boolean;
  result?: unknown;
  error?: string;
  missing?: string[];
  durationMs: number;
  logs?: LogEntry[];
}

// Add source result
export interface AddSourceResult {
  success: boolean;
  filesCreated: string[];
  errors: string[];
  nextSteps: string[];
}

/**
 * Get sources from manifest
 * Sources are discovered during manifest generation
 */
export function useSources(): Source[] {
  const { data: manifest } = useManifest();
  return (manifest?.sources as Source[]) ?? [];
}

/**
 * Trigger sync for a source
 * Returns the sync result when complete
 */
export function useSyncSource() {
  const port = useRuntimePort();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sourceId: string): Promise<SyncResult> => {
      if (!port) throw new Error("Runtime not available");

      const res = await fetch(`http://localhost:${port}/sources/${sourceId}/sync`, {
        method: "POST",
      });

      const data = await res.json();

      // Return the result even if not successful (for error display)
      return data as SyncResult;
    },
    onSuccess: () => {
      // Refresh manifest (includes sources) and db schema
      queryClient.invalidateQueries({ queryKey: ["manifest"] });
      queryClient.invalidateQueries({ queryKey: ["db-schema"] });
    },
  });
}

/**
 * List available sources from registry
 * NOTE: Disabled until the /workbook/sources/available endpoint is implemented
 */
export function useAvailableSources() {
  const port = useRuntimePort();

  return useQuery({
    queryKey: ["available-sources", port],
    queryFn: async (): Promise<AvailableSource[]> => {
      if (!port) return [];
      const res = await fetch(`http://localhost:${port}/workbook/sources/available`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      return data.sources ?? [];
    },
    enabled: false, // Disabled until endpoint exists
    staleTime: 60000, // Registry doesn't change often
  });
}

/**
 * Add a source from registry to workbook
 */
export function useAddSource() {
  const port = useRuntimePort();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sourceName: string): Promise<AddSourceResult> => {
      if (!port) throw new Error("Runtime not available");

      const res = await fetch(`http://localhost:${port}/workbook/sources/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceName }),
      });

      const data = await res.json();
      return data as AddSourceResult;
    },
    onSuccess: () => {
      // Refresh manifest (includes sources)
      queryClient.invalidateQueries({ queryKey: ["manifest"] });
    },
  });
}

/**
 * Save source spec
 */
export function useSaveSpec() {
  const port = useRuntimePort();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      sourceId,
      spec,
    }: {
      sourceId: string;
      spec: string;
    }): Promise<{ success: boolean }> => {
      if (!port) throw new Error("Runtime not available");

      const res = await fetch(`http://localhost:${port}/sources/${sourceId}/spec`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spec }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to save spec");
      }
      return data;
    },
    onSuccess: () => {
      // Refresh manifest to update spec
      queryClient.invalidateQueries({ queryKey: ["manifest"] });
    },
  });
}

/**
 * Validate source - triggers background task to ensure code matches spec
 */
export function useValidateSource() {
  const port = useRuntimePort();

  return useMutation({
    mutationFn: async ({ sourceId }: { sourceId: string }): Promise<{ taskId: string }> => {
      if (!port) throw new Error("Runtime not available");

      const res = await fetch(`http://localhost:${port}/sources/${sourceId}/validate`, {
        method: "POST",
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to start validation");
      }
      return data;
    },
  });
}

/**
 * Save secrets to .env.local
 */
export function useSaveSecrets() {
  const port = useRuntimePort();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      secrets: Record<string, string>,
    ): Promise<{ success: boolean; saved: string[] }> => {
      if (!port) throw new Error("Runtime not available");

      const res = await fetch(`http://localhost:${port}/secrets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secrets }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to save secrets");
      }
      return data;
    },
    onSuccess: () => {
      // Refresh manifest to update missingSecrets
      queryClient.invalidateQueries({ queryKey: ["manifest"] });
    },
  });
}

/**
 * Hook for syncing a source with streaming logs
 */
export function useStreamingSync() {
  const port = useRuntimePort();
  const queryClient = useQueryClient();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);

  const sync = useCallback(
    async (sourceId: string) => {
      if (!port) throw new Error("Runtime not available");

      setLogs([]);
      setResult(null);
      setIsRunning(true);

      try {
        const eventSource = new EventSource(
          `http://localhost:${port}/sources/${sourceId}/sync/stream`,
        );

        await new Promise<SyncResult>((resolve, reject) => {
          eventSource.onmessage = (event) => {
            try {
              const data = JSON.parse(event.data);

              if (data.type === "log") {
                setLogs((prev) => [
                  ...prev,
                  {
                    timestamp: data.timestamp,
                    level: data.level,
                    message: data.message,
                  },
                ]);
              } else if (data.type === "result") {
                setResult(data);
                eventSource.close();
                resolve(data);
              }
            } catch (err) {
              console.error("Failed to parse SSE message:", err);
            }
          };

          eventSource.onerror = (err) => {
            console.error("SSE error:", err);
            eventSource.close();
            reject(new Error("Stream connection failed"));
          };
        });

        // Refresh data
        queryClient.invalidateQueries({ queryKey: ["manifest"] });
        queryClient.invalidateQueries({ queryKey: ["db-schema"] });
      } finally {
        setIsRunning(false);
      }
    },
    [port, queryClient],
  );

  const reset = useCallback(() => {
    setLogs([]);
    setResult(null);
    setIsRunning(false);
  }, []);

  return {
    sync,
    logs,
    isRunning,
    result,
    reset,
  };
}

/**
 * Combined hook for common source operations
 */
export function useSourceManagement() {
  const { data: manifest, isLoading, error, refetch } = useManifest();
  const sources = (manifest?.sources as Source[]) ?? [];
  const syncMutation = useSyncSource();
  const availableSources = useAvailableSources();
  const addMutation = useAddSource();
  const saveSecretsMutation = useSaveSecrets();

  return {
    // Installed sources (from manifest)
    sources,
    isLoading,
    error,

    // Available sources from registry
    availableSources: availableSources.data ?? [],
    isLoadingAvailable: availableSources.isLoading,

    // Sync mutation
    syncSource: syncMutation.mutateAsync,
    isSyncing: syncMutation.isPending,
    syncingSourceId: syncMutation.variables,
    syncResult: syncMutation.data,
    syncError: syncMutation.error,

    // Add mutation
    addSource: addMutation.mutateAsync,
    isAdding: addMutation.isPending,
    addResult: addMutation.data,
    addError: addMutation.error,

    // Secrets
    saveSecrets: saveSecretsMutation.mutateAsync,
    isSavingSecrets: saveSecretsMutation.isPending,

    // Refetch
    refresh: refetch,
  };
}

/**
 * Hook for validating source code against its spec
 *
 * Uses a background agent task to analyze the source and spec,
 * then reports pass/fail with details.
 */
export function useSourceValidation(source: Source | undefined) {
  const task = useBackgroundTask();

  const validate = useCallback(() => {
    if (!source) return;

    const prompt = `Validate the source "${source.name}" against its spec.

Source file: sources/${source.name}/${source.name}.ts
Spec:
${source.spec || "(No spec defined)"}

Please check:
1. Does the code implement what the spec describes?
2. Are all tables mentioned in the spec created by the code?
3. Does the sync behavior match what's documented?

If validation passes, respond with "✅ Validation passed" and a brief summary.
If validation fails, respond with "❌ Validation failed" and list the issues.`;

    task.run(prompt, {
      agent: "coder",
      title: `Validate: ${source.name}`,
      onSuccess: () => {
        toast.success(`Validation passed for ${source.name}`);
      },
      onFailure: (result) => {
        toast.error(`Validation failed for ${source.name}`, {
          description: result.error,
        });
      },
    });
  }, [source, task]);

  const fix = useCallback(() => {
    if (!source) return;

    const prompt = `Fix the source "${source.name}" to match its spec.

Source file: sources/${source.name}/${source.name}.ts
Spec:
${source.spec || "(No spec defined)"}

Please update the source code to:
1. Implement all functionality described in the spec
2. Create all tables mentioned in the spec
3. Match the documented sync behavior

After fixing, validate your changes and confirm with "✅ Fixed and validated".`;

    task.run(prompt, {
      agent: "coder",
      title: `Fix: ${source.name}`,
      onSuccess: () => {
        toast.success(`Fixed ${source.name} to match spec`);
      },
      onFailure: (result) => {
        toast.error(`Failed to fix ${source.name}`, {
          description: result.error,
        });
      },
    });
  }, [source, task]);

  return {
    state: task.state,
    validate,
    fix,
    cancel: task.cancel,
    reset: task.reset,
  };
}

/**
 * Hook for running source tests
 *
 * Uses the runtime's test endpoint to run bun tests for a source.
 */
export function useSourceTests(sourceId: string) {
  const port = useRuntimePort();
  const [logs, setLogs] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<{ success: boolean; summary?: string } | null>(null);

  const runTests = useCallback(async () => {
    if (!port) {
      toast.error("Runtime not available");
      return;
    }

    setLogs([]);
    setResult(null);
    setIsRunning(true);

    try {
      const eventSource = new EventSource(`http://localhost:${port}/sources/${sourceId}/test`);

      await new Promise<void>((resolve, reject) => {
        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);

            if (data.type === "log") {
              setLogs((prev) => [...prev, data.message]);
            } else if (data.type === "result") {
              setResult({ success: data.success, summary: data.summary });
              eventSource.close();

              if (data.success) {
                toast.success("Tests passed!");
              } else {
                toast.error("Tests failed", { description: data.summary });
              }

              resolve();
            }
          } catch (err) {
            console.error("Failed to parse test SSE message:", err);
          }
        };

        eventSource.onerror = (err) => {
          console.error("Test SSE error:", err);
          eventSource.close();
          reject(new Error("Test stream connection failed"));
        };
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      setResult({ success: false, summary: error });
      toast.error("Failed to run tests", { description: error });
    } finally {
      setIsRunning(false);
    }
  }, [port, sourceId]);

  const reset = useCallback(() => {
    setLogs([]);
    setResult(null);
    setIsRunning(false);
  }, []);

  return {
    runTests,
    logs,
    isRunning,
    result,
    reset,
  };
}
