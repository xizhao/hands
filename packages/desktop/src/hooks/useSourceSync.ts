/**
 * Source Sync Hook
 *
 * Git-based sync status tracking between spec.md and source code.
 * Uses runtime endpoint to get actual git status.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { toast } from "sonner";
import { useBackgroundTask } from "@/hooks/useBackgroundTask";
import { useRuntimePort } from "@/hooks/useRuntimeState";
import type { Source } from "@/hooks/useSources";

// Git sync status from runtime
export interface GitSyncStatus {
  status: "synced" | "spec-ahead" | "code-ahead" | "diverged" | "unknown" | "no-spec";
  specModified: boolean;
  codeModified: boolean;
  specLastCommit: string | null;
  codeLastCommit: string | null;
  specMtime: number | null;
  codeMtime: number | null;
  message: string;
  // Diff stats (GitHub-style +/- counts)
  diffStats: {
    additions: number;
    deletions: number;
  } | null;
}

// Spec file info
export interface SpecInfo {
  spec: string | null;
  source: "file" | "inline" | null;
  path: string | null;
}

/**
 * Hook for fetching spec content from spec.md file
 */
export function useSourceSpec(sourceId: string | undefined) {
  const port = useRuntimePort();

  return useQuery({
    queryKey: ["source-spec", sourceId, port],
    queryFn: async (): Promise<SpecInfo> => {
      if (!port || !sourceId) throw new Error("Not ready");

      const res = await fetch(`http://localhost:${port}/sources/${sourceId}/spec`);
      if (!res.ok) throw new Error("Failed to fetch spec");
      return res.json();
    },
    enabled: !!port && !!sourceId,
    staleTime: 0,
  });
}

/**
 * Hook for git-based sync status
 */
export function useGitSyncStatus(sourceId: string | undefined) {
  const port = useRuntimePort();

  return useQuery({
    queryKey: ["source-sync-status", sourceId, port],
    queryFn: async (): Promise<GitSyncStatus> => {
      if (!port || !sourceId) throw new Error("Not ready");

      const res = await fetch(`http://localhost:${port}/sources/${sourceId}/sync-status`);
      if (!res.ok) throw new Error("Failed to fetch sync status");
      return res.json();
    },
    enabled: !!port && !!sourceId,
    refetchInterval: 5000, // Poll every 5 seconds for git changes
    staleTime: 2000,
  });
}

interface UseSourceSyncOptions {
  onPushSuccess?: () => void;
  onPullSuccess?: () => void;
}

/**
 * Hook for managing spec <-> code sync operations
 */
export function useSourceSync(source: Source | undefined, options?: UseSourceSyncOptions) {
  const _port = useRuntimePort();
  const queryClient = useQueryClient();
  const pushTask = useBackgroundTask();
  const pullTask = useBackgroundTask();

  // Get git sync status
  const { data: syncStatus, refetch: refetchStatus } = useGitSyncStatus(source?.id);

  // Get spec content
  const { data: specInfo, refetch: refetchSpec } = useSourceSpec(source?.id);

  // Push: spec -> code (regenerate code from spec)
  const push = useCallback(async () => {
    if (!source) return;

    const specContent = specInfo?.spec || source.spec || "";

    await pushTask.run(
      `Update the source code for "${source.name}" to match its spec.

Source folder: sources/${source.name}/
Spec file: sources/${source.name}/spec.md

Current spec content:
${specContent}

Please:
1. Read the current source code in sources/${source.name}/index.ts
2. Compare it against the spec
3. Update the code to match what the spec describes
4. Ensure all tables, fields, and behaviors match the spec
5. After changes, confirm with "✅ Code updated to match spec"

If the code already matches the spec, respond with "✅ Code already matches spec"`,
      {
        agent: "coder",
        title: `Push: ${source.name}`,
        onSuccess: () => {
          toast.success(`Pushed spec to code for ${source.name}`);
          refetchStatus();
          options?.onPushSuccess?.();
        },
        onFailure: (result) => {
          toast.error(`Failed to push spec to code`, {
            description: result.error,
          });
        },
      },
    );
  }, [source, specInfo, pushTask, options, refetchStatus]);

  // Pull: code -> spec (update spec from code)
  const pull = useCallback(async () => {
    if (!source) return;

    await pullTask.run(
      `Analyze the source code for "${source.name}" and update its spec.md file to match.

Source folder: sources/${source.name}/
Spec file: sources/${source.name}/spec.md
Code file: sources/${source.name}/index.ts

Please:
1. Read the current source code in sources/${source.name}/index.ts thoroughly
2. Document what the code actually does:
   - What tables it creates and their columns
   - What data it syncs and from where
   - What the sync behavior is (frequency, upsert logic, etc.)
3. Write a complete spec.md file that accurately describes the implementation
4. Use clear markdown with sections for Intent, Tables, and Behavior
5. After updating spec.md, confirm with "✅ Spec updated from code"

Generate a complete spec that someone could use to understand and recreate this source.`,
      {
        agent: "coder",
        title: `Pull: ${source.name}`,
        onSuccess: () => {
          toast.success(`Pulled code to spec for ${source.name}`);
          refetchStatus();
          refetchSpec();
          queryClient.invalidateQueries({ queryKey: ["manifest"] });
          options?.onPullSuccess?.();
        },
        onFailure: (result) => {
          toast.error(`Failed to pull code to spec`, {
            description: result.error,
          });
        },
      },
    );
  }, [source, pullTask, options, refetchStatus, refetchSpec, queryClient]);

  return {
    // Git-based sync status
    syncStatus: syncStatus?.status ?? "unknown",
    syncMessage: syncStatus?.message ?? "Loading...",
    specModified: syncStatus?.specModified ?? false,
    codeModified: syncStatus?.codeModified ?? false,
    diffStats: syncStatus?.diffStats ?? null,

    // Spec content
    spec: specInfo?.spec ?? source?.spec ?? null,
    specSource: specInfo?.source ?? null,
    specPath: specInfo?.path ?? null,

    // Push/Pull operations
    push,
    pull,
    isPushing: pushTask.state.status === "running",
    isPulling: pullTask.state.status === "running",

    // Refresh
    refetchStatus,
    refetchSpec,
  };
}
