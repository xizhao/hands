/**
 * useFilePicker Hook
 *
 * Shared hook for file/folder picking and screenshot capture.
 * Used by both UnifiedSidebar and FloatingChat.
 */

import { invoke } from "@tauri-apps/api/core";
import { useCallback } from "react";

export interface FilePickerCallbacks {
  onFileSelected?: (path: string, name: string) => void;
  onFolderSelected?: (path: string, name: string) => void;
  onSnapshotStarted?: () => void;
  onError?: (error: unknown, operation: string) => void;
}

export interface FilePickerResult {
  handlePickFile: () => Promise<void>;
  handlePickFolder: () => Promise<void>;
  handleSnapshot: () => Promise<void>;
}

/**
 * Hook for file picking operations via Tauri.
 *
 * @param callbacks - Callback functions for file picker events
 * @returns Object with handler functions for each operation
 *
 * @example
 * ```tsx
 * const { handlePickFile, handlePickFolder, handleSnapshot } = useFilePicker({
 *   onFileSelected: (path, name) => addAttachment({ path, name }),
 *   onError: (err, op) => console.error(`Failed to ${op}:`, err),
 * });
 * ```
 */
export function useFilePicker(callbacks: FilePickerCallbacks = {}): FilePickerResult {
  const { onFileSelected, onFolderSelected, onSnapshotStarted, onError } = callbacks;

  const handlePickFile = useCallback(async () => {
    try {
      const filePath = await invoke<string | null>("pick_file");
      if (filePath) {
        const fileName = filePath.split("/").pop() || filePath;
        onFileSelected?.(filePath, fileName);
      }
    } catch (err) {
      console.error("[useFilePicker] Failed to pick file:", err);
      onError?.(err, "pick file");
    }
  }, [onFileSelected, onError]);

  const handlePickFolder = useCallback(async () => {
    try {
      const folderPath = await invoke<string | null>("pick_folder");
      if (folderPath) {
        const folderName = folderPath.split("/").pop() || folderPath;
        onFolderSelected?.(folderPath, folderName);
      }
    } catch (err) {
      console.error("[useFilePicker] Failed to pick folder:", err);
      onError?.(err, "pick folder");
    }
  }, [onFolderSelected, onError]);

  const handleSnapshot = useCallback(async () => {
    try {
      await invoke("start_capture_command");
      onSnapshotStarted?.();
    } catch (err) {
      console.error("[useFilePicker] Failed to start capture:", err);
      onError?.(err, "start capture");
    }
  }, [onSnapshotStarted, onError]);

  return { handlePickFile, handlePickFolder, handleSnapshot };
}
