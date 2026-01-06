/**
 * Workbooks Hook
 *
 * Manages workbook list state with CRUD operations.
 * Single source of truth for workbook data across routes.
 */

import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  createWorkbook as createWorkbookStorage,
  deleteWorkbook as deleteWorkbookStorage,
  listWorkbooks,
  type WorkbookMeta,
} from "../shared/lib/storage";

export function useWorkbooks() {
  const navigate = useNavigate();
  const [workbooks, setWorkbooks] = useState<WorkbookMeta[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load workbooks on mount
  useEffect(() => {
    listWorkbooks()
      .then(setWorkbooks)
      .finally(() => setIsLoading(false));
  }, []);

  // Refresh workbooks list
  const refresh = useCallback(async () => {
    const updated = await listWorkbooks();
    setWorkbooks(updated);
    return updated;
  }, []);

  // Create new workbook and navigate to it
  const createWorkbook = useCallback(
    async (name: string = "New Workbook") => {
      const workbook = await createWorkbookStorage(name);
      setWorkbooks((prev) => [workbook, ...prev]);
      return workbook;
    },
    []
  );

  // Create and navigate in one action
  const createAndOpen = useCallback(
    async (name: string = "New Workbook", search?: Record<string, string>) => {
      const workbook = await createWorkbook(name);
      navigate({
        to: "/w/$workbookId",
        params: { workbookId: workbook.id },
        search,
      });
      return workbook;
    },
    [createWorkbook, navigate]
  );

  // Delete workbook
  const deleteWorkbook = useCallback(
    async (id: string, currentWorkbookId?: string) => {
      await deleteWorkbookStorage(id);
      const remaining = workbooks.filter((w) => w.id !== id);
      setWorkbooks(remaining);

      // If deleted current, navigate away
      if (id === currentWorkbookId) {
        if (remaining.length > 0) {
          navigate({
            to: "/w/$workbookId",
            params: { workbookId: remaining[0].id },
          });
        } else {
          navigate({ to: "/" });
        }
      }

      return remaining;
    },
    [workbooks, navigate]
  );

  // Open existing workbook
  const openWorkbook = useCallback(
    (id: string) => {
      navigate({ to: "/w/$workbookId", params: { workbookId: id } });
    },
    [navigate]
  );

  // Go to landing
  const goHome = useCallback(() => {
    navigate({ to: "/" });
  }, [navigate]);

  return {
    workbooks,
    isLoading,
    refresh,
    createWorkbook,
    createAndOpen,
    deleteWorkbook,
    openWorkbook,
    goHome,
  };
}
