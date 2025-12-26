/**
 * ContentHeader - Header for the content area with breadcrumb and route-specific actions
 *
 * Shows current route (page/source/table/action) with close button.
 * Right side is a slot for route-specific actions (via HeaderActionsSlot).
 */

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useRuntimeState } from "@/hooks/useRuntimeState";
import { X } from "@phosphor-icons/react";
import { useRouter, useRouterState } from "@tanstack/react-router";
import { type ReactNode } from "react";
import { HeaderActionsSlot } from "./HeaderActionsContext";

interface ContentHeaderProps {
  children?: ReactNode;
}

export function ContentHeader({ children }: ContentHeaderProps) {
  const router = useRouter();
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;

  // Extract route info
  const sourceMatch = currentPath.match(/^\/sources\/(.+)$/);
  const sourceId = sourceMatch?.[1];
  const tableMatch = currentPath.match(/^\/tables\/(.+)$/);
  const tableId = tableMatch?.[1];
  const pageMatch = currentPath.match(/^\/pages\/(.+)$/);
  const pageId = pageMatch?.[1];
  const actionMatch = currentPath.match(/^\/actions\/(.+)$/);
  const actionId = actionMatch?.[1];

  const isOnContentRoute = sourceId || tableId || pageId || actionId;

  // Runtime state
  const { manifest } = useRuntimeState();

  // Current items from manifest
  const currentSource = manifest?.sources?.find((s) => s.id === sourceId);
  const currentPage = manifest?.pages?.find(
    (p) => p.id === pageId || p.route === `/${pageId}`
  );
  const currentAction = manifest?.actions?.find((a) => a.id === actionId);

  const handleClose = () => {
    router.navigate({ to: "/" });
  };

  // On index route, show minimal header with just the actions slot
  if (!isOnContentRoute) {
    return (
      <header
        data-tauri-drag-region
        className="h-10 flex items-center justify-between px-4 pt-0.5 shrink-0"
      >
        <div className="flex-1" />
        <HeaderActionsSlot />
      </header>
    );
  }

  // Content route header with breadcrumb
  return (
    <header
      data-tauri-drag-region
      className="h-10 flex items-center justify-between px-4 pt-0.5 shrink-0"
    >
      {/* Left: Breadcrumb */}
      <div className="flex items-center gap-1 group/breadcrumb">
        {sourceId && (
          <>
            <span className="px-1 py-0.5 text-sm text-foreground bg-transparent rounded-sm">
              {currentSource?.title || sourceId}
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleClose}
                  className="ml-1 p-0.5 rounded-sm text-muted-foreground/70 hover:text-muted-foreground hover:bg-accent/50 transition-colors opacity-0 group-hover/breadcrumb:opacity-100"
                >
                  <X weight="bold" className="h-3 w-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Close source</TooltipContent>
            </Tooltip>
          </>
        )}
        {tableId && (
          <>
            <span className="px-1 py-0.5 text-sm text-foreground bg-transparent rounded-sm">
              {tableId}
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleClose}
                  className="ml-1 p-0.5 rounded-sm text-muted-foreground/70 hover:text-muted-foreground hover:bg-accent/50 transition-colors opacity-0 group-hover/breadcrumb:opacity-100"
                >
                  <X weight="bold" className="h-3 w-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Close table</TooltipContent>
            </Tooltip>
          </>
        )}
        {pageId && (
          <>
            <span className="px-1 py-0.5 text-sm text-foreground bg-transparent rounded-sm">
              {currentPage?.title || pageId}
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleClose}
                  className="ml-1 p-0.5 rounded-sm text-muted-foreground/70 hover:text-muted-foreground hover:bg-accent/50 transition-colors opacity-0 group-hover/breadcrumb:opacity-100"
                >
                  <X weight="bold" className="h-3 w-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Close page</TooltipContent>
            </Tooltip>
          </>
        )}
        {actionId && (
          <>
            <span className="px-1 py-0.5 text-sm text-foreground bg-transparent rounded-sm">
              {currentAction?.name || actionId}
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleClose}
                  className="ml-1 p-0.5 rounded-sm text-muted-foreground/70 hover:text-muted-foreground hover:bg-accent/50 transition-colors opacity-0 group-hover/breadcrumb:opacity-100"
                >
                  <X weight="bold" className="h-3 w-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Close action</TooltipContent>
            </Tooltip>
          </>
        )}
      </div>

      {/* Right: Route-specific actions */}
      <HeaderActionsSlot />
    </header>
  );
}
