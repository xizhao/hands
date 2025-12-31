/**
 * useWorkbookSwitcher Hook
 *
 * Shared hook for switching between workbooks.
 * Handles the common logic of opening a workbook and optionally creating new ones.
 */

import { useCallback } from "react";
import { useCreateWorkbook, useOpenWorkbook, type Workbook } from "./useWorkbook";

export interface WorkbookSwitcherOptions {
  /** Called before switching workbooks - use to reset state */
  onBeforeSwitch?: () => void;
  /** Called after workbook is successfully opened */
  onAfterSwitch?: (workbook: Workbook) => void;
  /** Called after a new workbook is created */
  onAfterCreate?: (workbook: Workbook) => void;
  /** Called on error */
  onError?: (error: unknown, operation: string) => void;
}

export interface WorkbookSwitcherResult {
  /** Switch to a different workbook */
  switchWorkbook: (workbook: Workbook) => void;
  /** Create a new workbook and switch to it */
  createWorkbook: (name?: string) => void;
  /** Whether a switch is in progress */
  isSwitching: boolean;
  /** Whether creation is in progress */
  isCreating: boolean;
}

/**
 * Hook for switching between workbooks.
 *
 * @param options - Configuration callbacks
 * @returns Object with switch/create handlers and loading states
 *
 * @example
 * ```tsx
 * const { switchWorkbook, createWorkbook, isSwitching } = useWorkbookSwitcher({
 *   onBeforeSwitch: () => resetSidebarState(),
 *   onAfterSwitch: (wb) => {
 *     setActiveWorkbook(wb);
 *     invalidateQueries();
 *   },
 * });
 * ```
 */
export function useWorkbookSwitcher(options: WorkbookSwitcherOptions = {}): WorkbookSwitcherResult {
  const { onBeforeSwitch, onAfterSwitch, onAfterCreate, onError } = options;

  const openWorkbookMutation = useOpenWorkbook();
  const createWorkbookMutation = useCreateWorkbook();

  const switchWorkbook = useCallback(
    (workbook: Workbook) => {
      if (!workbook.directory) {
        console.warn("[useWorkbookSwitcher] Workbook has no directory:", workbook);
        return;
      }

      // Call before hook for state cleanup
      onBeforeSwitch?.();

      openWorkbookMutation.mutate(workbook, {
        onSuccess: () => {
          onAfterSwitch?.(workbook);
        },
        onError: (err) => {
          console.error("[useWorkbookSwitcher] Failed to open workbook:", err);
          onError?.(err, "switch workbook");
        },
      });
    },
    [openWorkbookMutation, onBeforeSwitch, onAfterSwitch, onError],
  );

  const createWorkbook = useCallback(
    (name = "Untitled Workbook") => {
      createWorkbookMutation.mutate(
        { name },
        {
          onSuccess: (result) => {
            // Type assertion needed because mutation result type isn't fully inferred
            const newWorkbook = result as Workbook;
            onAfterCreate?.(newWorkbook);
            // Auto-switch to the new workbook
            switchWorkbook(newWorkbook);
          },
          onError: (err) => {
            console.error("[useWorkbookSwitcher] Failed to create workbook:", err);
            onError?.(err, "create workbook");
          },
        },
      );
    },
    [createWorkbookMutation, switchWorkbook, onAfterCreate, onError],
  );

  return {
    switchWorkbook,
    createWorkbook,
    isSwitching: openWorkbookMutation.isPending,
    isCreating: createWorkbookMutation.isPending,
  };
}
