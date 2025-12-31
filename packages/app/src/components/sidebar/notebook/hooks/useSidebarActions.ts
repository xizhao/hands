/**
 * Sidebar Actions Hook
 *
 * CRUD operations and navigation handlers for sidebar items.
 */

import { useNavigate } from "@tanstack/react-router";
import { useCallback, useRef, useState } from "react";
import { useRuntimePort } from "@/hooks/useRuntimeState";
import { usePrefetchThumbnail } from "@/hooks/useThumbnails";
import { useCreatePage } from "@/hooks/useWorkbook";
import { trpc } from "@/lib/trpc";
import type { SidebarPage } from "../types";

export interface SidebarActionsOptions {
  /** When true, prevents navigation on item click */
  preventNavigation?: boolean;
  /** Callback when an item is selected (for preview mode) */
  onSelectItem?: (type: "page" | "source" | "table" | "action", id: string) => void;
}

export function useSidebarActions(options: SidebarActionsOptions = {}) {
  const { preventNavigation = false, onSelectItem } = options;
  const navigate = useNavigate();
  const runtimePort = useRuntimePort();
  const utils = trpc.useUtils();

  // Prefetch thumbnails
  const prefetchThumbnail = usePrefetchThumbnail();

  // Page creation
  const { mutateAsync: createPage, isPending: isCreatingPage } = useCreatePage();
  const [isCreatingNewPage, setIsCreatingNewPage] = useState(false);
  const [newPageName, setNewPageName] = useState("");
  const isConfirmingPageRef = useRef(false);

  // Page delete mutation
  const deletePageMutation = trpc.pages.delete.useMutation({
    onSuccess: () => {
      utils.pages.list.invalidate();
    },
  });

  // Page duplicate mutation
  const duplicatePageMutation = trpc.pages.duplicate.useMutation({
    onSuccess: () => {
      utils.pages.list.invalidate();
    },
  });

  // Navigation handlers - all go to domain routes now
  const handlePageClick = useCallback(
    (pageId: string) => {
      if (preventNavigation) {
        onSelectItem?.("page", pageId);
        return;
      }
      // Pages are now domain page tabs
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      navigate({
        to: "/domains/$domainId",
        params: { domainId: pageId },
        search: { tab: "page" },
      } as any);
    },
    [navigate, preventNavigation, onSelectItem],
  );

  const handleSourceClick = useCallback(
    (sourceId: string) => {
      if (preventNavigation) {
        onSelectItem?.("source", sourceId);
        return;
      }
      // Sources deprecated - navigate to domain sheet tab
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      navigate({
        to: "/domains/$domainId",
        params: { domainId: sourceId },
        search: { tab: "sheet" },
      } as any);
    },
    [navigate, preventNavigation, onSelectItem],
  );

  const handleTableClick = useCallback(
    (tableId: string) => {
      if (preventNavigation) {
        onSelectItem?.("table", tableId);
        return;
      }
      // Tables are now domain sheet tabs
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      navigate({
        to: "/domains/$domainId",
        params: { domainId: tableId },
        search: { tab: "sheet" },
      } as any);
    },
    [navigate, preventNavigation, onSelectItem],
  );

  const handleActionClick = useCallback(
    (actionId: string) => {
      if (preventNavigation) {
        onSelectItem?.("action", actionId);
        return;
      }
      navigate({ to: "/actions/$actionId", params: { actionId } });
    },
    [navigate, preventNavigation, onSelectItem],
  );

  // Page creation handlers
  const handleStartNewPage = useCallback(() => {
    setIsCreatingNewPage(true);
    setNewPageName("");
  }, []);

  const handleCancelNewPage = useCallback(() => {
    setIsCreatingNewPage(false);
    setNewPageName("");
  }, []);

  const handleConfirmNewPage = useCallback(
    async (pages: SidebarPage[]) => {
      if (isConfirmingPageRef.current) return;

      if (!newPageName.trim()) {
        handleCancelNewPage();
        return;
      }

      const pageId = newPageName
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

      if (!pageId) {
        handleCancelNewPage();
        return;
      }

      isConfirmingPageRef.current = true;

      const existingPage = pages.find((p) => p.id === pageId);
      if (existingPage) {
        setIsCreatingNewPage(false);
        setNewPageName("");
        isConfirmingPageRef.current = false;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        navigate({
          to: "/domains/$domainId",
          params: { domainId: pageId },
          search: { tab: "page" },
        } as any);
        return;
      }

      try {
        await createPage({ pageId });
        setIsCreatingNewPage(false);
        setNewPageName("");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        navigate({
          to: "/domains/$domainId",
          params: { domainId: pageId },
          search: { tab: "page" },
        } as any);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to create page";
        if (message.includes("already exists")) {
          setIsCreatingNewPage(false);
          setNewPageName("");
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          navigate({
            to: "/domains/$domainId",
            params: { domainId: pageId },
            search: { tab: "page" },
          } as any);
        } else {
          console.error("[sidebar] failed to create page:", err);
        }
      } finally {
        isConfirmingPageRef.current = false;
      }
    },
    [newPageName, handleCancelNewPage, createPage, navigate],
  );

  // CRUD handlers
  const handleDuplicatePage = useCallback(
    async (pageId: string) => {
      try {
        const result = await duplicatePageMutation.mutateAsync({ route: pageId });
        console.log("[sidebar] duplicated page:", pageId, "->", result.newRoute);
        // Navigate to the new page
        if (result.newRoute) {
          const newPageId = result.newRoute.replace(/^\//, "");
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          navigate({
            to: "/domains/$domainId",
            params: { domainId: newPageId },
            search: { tab: "page" },
          } as any);
        }
      } catch (err) {
        console.error("[sidebar] failed to duplicate page:", err);
      }
    },
    [duplicatePageMutation, navigate],
  );

  const handleDeletePage = useCallback(
    async (pageId: string) => {
      try {
        await deletePageMutation.mutateAsync({ route: pageId });
        console.log("[sidebar] deleted page:", pageId);
        navigate({ to: "/" });
      } catch (err) {
        console.error("[sidebar] failed to delete page:", err);
      }
    },
    [deletePageMutation, navigate],
  );

  const handleCopySource = useCallback(
    async (sourceId: string) => {
      if (!runtimePort) return;
      try {
        const res = await fetch(
          `http://localhost:${runtimePort}/workbook/sources/${sourceId}/duplicate`,
          { method: "POST" },
        );
        if (!res.ok) throw new Error("Failed to duplicate source");
        console.log("[sidebar] duplicated source:", sourceId);
      } catch (err) {
        console.error("[sidebar] failed to duplicate source:", err);
      }
    },
    [runtimePort],
  );

  const handleDeleteSource = useCallback(
    async (sourceId: string) => {
      if (!runtimePort) return;
      try {
        const res = await fetch(`http://localhost:${runtimePort}/workbook/sources/${sourceId}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error("Failed to delete source");
        console.log("[sidebar] deleted source:", sourceId);
        navigate({ to: "/" });
      } catch (err) {
        console.error("[sidebar] failed to delete source:", err);
      }
    },
    [runtimePort, navigate],
  );

  const handleDeleteTable = useCallback(
    async (tableName: string) => {
      if (!runtimePort) return;
      try {
        const res = await fetch(`http://localhost:${runtimePort}/postgres/tables/${tableName}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error("Failed to delete table");
        console.log("[sidebar] deleted table:", tableName);
        navigate({ to: "/" });
      } catch (err) {
        console.error("[sidebar] failed to delete table:", err);
      }
    },
    [runtimePort, navigate],
  );

  const handleConvertToSource = useCallback(
    async (tableName: string) => {
      if (!runtimePort) return;
      try {
        const res = await fetch(
          `http://localhost:${runtimePort}/workbook/sources/from-table/${tableName}`,
          { method: "POST" },
        );
        if (!res.ok) throw new Error("Failed to convert table to source");
        const data = await res.json();
        console.log("[sidebar] converted table to source:", tableName, data);
        // Navigate to the domain sheet tab
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        navigate({
          to: "/domains/$domainId",
          params: { domainId: tableName },
          search: { tab: "sheet" },
        } as any);
      } catch (err) {
        console.error("[sidebar] failed to convert table to source:", err);
      }
    },
    [runtimePort, navigate],
  );

  const handleRunAction = useCallback(
    async (actionId: string) => {
      if (!runtimePort) return false;
      try {
        const res = await fetch(`http://localhost:${runtimePort}/trpc/actions.run`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: actionId }),
        });
        if (!res.ok) {
          console.error("[sidebar] Failed to run action:", await res.text());
          return false;
        }
        console.log("[sidebar] Action started:", actionId);
        return true;
      } catch (err) {
        console.error("[sidebar] Error running action:", err);
        return false;
      }
    },
    [runtimePort],
  );

  return {
    // Runtime port
    runtimePort,

    // Navigation
    handlePageClick,
    handleSourceClick,
    handleTableClick,
    handleActionClick,
    prefetchThumbnail,

    // Page creation
    isCreatingNewPage,
    isCreatingPage,
    newPageName,
    setNewPageName,
    handleStartNewPage,
    handleCancelNewPage,
    handleConfirmNewPage,

    // Page CRUD
    handleDuplicatePage,
    handleDeletePage,

    // Source operations (deprecated - sources removed)
    handleCopySource,
    handleDeleteSource,

    // Legacy source operations (stubs for backward compat)
    handleAddSource: async (_sourceName: string) => {},
    syncSource: async (_sourceId: string) => {},
    isAdding: false,
    isSyncing: false,
    syncingSourceId: null as string | null,

    // Table operations
    handleDeleteTable,
    handleConvertToSource,

    // Action operations
    handleRunAction,
  };
}

export type SidebarActions = ReturnType<typeof useSidebarActions>;
