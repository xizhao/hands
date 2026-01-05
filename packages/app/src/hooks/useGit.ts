/**
 * @deprecated This file is deprecated. Use usePersistence instead.
 *
 * The persistence hooks provide a platform-agnostic abstraction:
 * - usePersistenceStatus() - replaces useGitStatus()
 * - useSave() - replaces useGitSave()
 * - usePersistenceHistory() - replaces useGitHistory()
 * - useRevert() - replaces useGitRevert()
 * - usePush() / usePull() - replaces useGitPush() / useGitPull()
 *
 * These hooks work on both desktop (git-backed) and web (auto-save) platforms.
 *
 * Old description:
 * Git Integration Hooks - React Query hooks for git version control operations via tRPC.
 * Uses the runtime's git router for status, commits, history, and remote operations.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePlatform } from "../platform";
import { useRuntimeState } from "./useRuntimeState";

// ============================================================================
// Types (matching runtime git module)
// ============================================================================

export interface GitStatus {
  isRepo: boolean;
  branch: string | null;
  hasChanges: boolean;
  staged: string[];
  unstaged: string[];
  untracked: string[];
  remote: string | null;
  ahead: number;
  behind: number;
}

export interface GitCommit {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  email: string;
  date: string;
  timestamp: number;
}

export interface GitDiffStats {
  filesChanged: number;
  insertions: number;
  deletions: number;
  dbSizeCurrent: number | null;
  dbSizeLastCommit: number | null;
  hasDbChange: boolean;
}

// ============================================================================
// tRPC Helper
// ============================================================================

async function trpcQuery<T>(port: number, path: string, input?: unknown): Promise<T> {
  const url = input
    ? `http://localhost:${port}/trpc/${path}?input=${encodeURIComponent(JSON.stringify(input))}`
    : `http://localhost:${port}/trpc/${path}`;

  const res = await fetch(url);
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: "Request failed" }));
    throw new Error(error.message || `tRPC ${path} failed`);
  }

  const data = await res.json();
  return data.result?.data as T;
}

async function trpcMutation<T>(port: number, path: string, input?: unknown): Promise<T> {
  const res = await fetch(`http://localhost:${port}/trpc/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input ?? {}),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: "Request failed" }));
    throw new Error(error.error?.message || error.message || `tRPC ${path} failed`);
  }

  const data = await res.json();
  return data.result?.data as T;
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Check if we're on a platform that supports git (desktop only)
 */
function useIsGitAvailable() {
  const platform = usePlatform();
  const { port } = useRuntimeState();
  // Git requires desktop platform and a real runtime port (not sentinel value 1)
  return platform.platform === "desktop" && !!port && port > 1;
}

/**
 * Get git status for the workbook
 */
export function useGitStatus() {
  const { port, workbookId } = useRuntimeState();
  const isAvailable = useIsGitAvailable();

  return useQuery({
    queryKey: ["git-status", workbookId, port],
    queryFn: async (): Promise<GitStatus> => {
      if (!port) throw new Error("Runtime not connected");
      return trpcQuery<GitStatus>(port, "git.status");
    },
    enabled: isAvailable && !!workbookId,
    staleTime: 5_000, // Cache for 5 seconds
    refetchInterval: 10_000, // Poll every 10 seconds
  });
}

/**
 * Get commit history
 */
export function useGitHistory(limit = 50) {
  const { port, workbookId } = useRuntimeState();
  const isAvailable = useIsGitAvailable();

  return useQuery({
    queryKey: ["git-history", workbookId, port, limit],
    queryFn: async (): Promise<GitCommit[]> => {
      if (!port) throw new Error("Runtime not connected");
      return trpcQuery<GitCommit[]>(port, "git.history", { limit });
    },
    enabled: isAvailable && !!workbookId,
    staleTime: 30_000, // Cache for 30 seconds
  });
}

/**
 * Get diff statistics for uncommitted changes
 */
export function useGitDiffStats() {
  const { port, workbookId } = useRuntimeState();
  const isAvailable = useIsGitAvailable();

  return useQuery({
    queryKey: ["git-diff-stats", workbookId, port],
    queryFn: async (): Promise<GitDiffStats> => {
      if (!port) throw new Error("Runtime not connected");
      return trpcQuery<GitDiffStats>(port, "git.diffStats");
    },
    enabled: isAvailable && !!workbookId,
    staleTime: 5_000, // Cache for 5 seconds
    refetchInterval: 10_000, // Poll every 10 seconds
  });
}

/**
 * Save workbook (saves database + commits changes)
 * This is the main save action - use this for the save button
 */
export function useGitSave() {
  const { port } = useRuntimeState();
  const queryClient = useQueryClient();
  const isAvailable = useIsGitAvailable();

  return useMutation({
    mutationKey: ["git-save"],
    mutationFn: async (message?: string): Promise<{ hash: string; message: string } | null> => {
      if (!isAvailable || !port) throw new Error("Git not available");
      return trpcMutation<{ hash: string; message: string } | null>(port, "git.save", { message });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["git-status"] });
      queryClient.invalidateQueries({ queryKey: ["git-history"] });
    },
  });
}

/**
 * Commit changes (without saving database first)
 */
export function useGitCommit() {
  const { port } = useRuntimeState();
  const queryClient = useQueryClient();
  const isAvailable = useIsGitAvailable();

  return useMutation({
    mutationKey: ["git-commit"],
    mutationFn: async (message?: string): Promise<{ hash: string; message: string }> => {
      if (!isAvailable || !port) throw new Error("Git not available");
      return trpcMutation<{ hash: string; message: string }>(port, "git.commit", { message });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["git-status"] });
      queryClient.invalidateQueries({ queryKey: ["git-history"] });
    },
  });
}

/**
 * Initialize git repo
 */
export function useGitInit() {
  const { port } = useRuntimeState();
  const queryClient = useQueryClient();
  const isAvailable = useIsGitAvailable();

  return useMutation({
    mutationKey: ["git-init"],
    mutationFn: async (): Promise<{ initialized: boolean }> => {
      if (!isAvailable || !port) throw new Error("Git not available");
      return trpcMutation<{ initialized: boolean }>(port, "git.init");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["git-status"] });
    },
  });
}

/**
 * Set remote origin URL
 */
export function useGitSetRemote() {
  const { port } = useRuntimeState();
  const queryClient = useQueryClient();
  const isAvailable = useIsGitAvailable();

  return useMutation({
    mutationKey: ["git-set-remote"],
    mutationFn: async (url: string): Promise<{ url: string }> => {
      if (!isAvailable || !port) throw new Error("Git not available");
      return trpcMutation<{ url: string }>(port, "git.setRemote", { url });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["git-status"] });
    },
  });
}

/**
 * Push to remote
 */
export function useGitPush() {
  const { port } = useRuntimeState();
  const queryClient = useQueryClient();
  const isAvailable = useIsGitAvailable();

  return useMutation({
    mutationKey: ["git-push"],
    mutationFn: async (): Promise<{ pushed: boolean }> => {
      if (!isAvailable || !port) throw new Error("Git not available");
      return trpcMutation<{ pushed: boolean }>(port, "git.push");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["git-status"] });
    },
  });
}

/**
 * Pull from remote
 */
export function useGitPull() {
  const { port } = useRuntimeState();
  const queryClient = useQueryClient();
  const isAvailable = useIsGitAvailable();

  return useMutation({
    mutationKey: ["git-pull"],
    mutationFn: async (): Promise<{ pulled: boolean }> => {
      if (!isAvailable || !port) throw new Error("Git not available");
      return trpcMutation<{ pulled: boolean }>(port, "git.pull");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["git-status"] });
      queryClient.invalidateQueries({ queryKey: ["git-history"] });
    },
  });
}

/**
 * Revert to a previous commit (safe - creates a new commit)
 */
export function useGitRevert() {
  const { port } = useRuntimeState();
  const queryClient = useQueryClient();
  const isAvailable = useIsGitAvailable();

  return useMutation({
    mutationKey: ["git-revert"],
    mutationFn: async (hash: string): Promise<{ hash: string; message: string }> => {
      if (!isAvailable || !port) throw new Error("Git not available");
      return trpcMutation<{ hash: string; message: string }>(port, "git.revert", { hash });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["git-status"] });
      queryClient.invalidateQueries({ queryKey: ["git-history"] });
    },
  });
}

/**
 * Check if git is available on this platform
 */
export { useIsGitAvailable };
