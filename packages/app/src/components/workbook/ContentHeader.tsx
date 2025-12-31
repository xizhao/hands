/**
 * ContentHeader - Header for the content area with breadcrumb and route-specific actions
 *
 * Shows current route (page/source/table/action) with close button.
 * Right side is a slot for route-specific actions (via HeaderActionsSlot).
 * For domains, includes Chrome-like tabs.
 */

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useRuntimeState } from "@/hooks/useRuntimeState";
import { X } from "@phosphor-icons/react";
import { FileText, Table2, Zap } from "lucide-react";
import { useRouter, useRouterState } from "@tanstack/react-router";
import { type ReactNode } from "react";
import { HeaderActionsSlot, SpecBarSlot, SyncStatusSlot } from "./HeaderActionsContext";
import { cn } from "@/lib/utils";
import type { DomainTab } from "@/components/sidebar/domain/types";

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
  const domainMatch = currentPath.match(/^\/domains\/(.+)$/);
  const domainId = domainMatch?.[1];

  const isOnContentRoute = sourceId || tableId || pageId || actionId || domainId;

  // Runtime state
  const { manifest } = useRuntimeState();

  // Current action from manifest (for breadcrumb)
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
  // For domains, use taller header with bottom border for tab bar
  const isDomainRoute = !!domainId;

  return (
    <header
      data-tauri-drag-region
      className={cn(
        "flex shrink-0",
        isDomainRoute
          ? "h-10 items-end pb-0 pl-2 pr-2" // Tabs at bottom, minimal padding for border radius
          : "h-10 items-center justify-between pt-0.5 px-4"
      )}
    >
      {/* Domain route - primary tab left, secondary tabs right */}
      {domainId && (
        <DomainTabs domainId={domainId} onClose={handleClose} />
      )}

      {/* Non-domain routes: Breadcrumb on left */}
      {!domainId && (
        <div className="flex items-center gap-1 group/breadcrumb">
          {sourceId && (
            <>
              <span className="px-1 py-0.5 text-sm text-foreground bg-transparent rounded-sm">
                {sourceId}
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
                {pageId}
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
      )}

      {/* Non-domain routes: Spacer + actions */}
      {!domainId && (
        <>
          <div className="flex-1" />
          <HeaderActionsSlot />
        </>
      )}
    </header>
  );
}

// Domain tabs component - left-aligned with page title as first tab
function DomainTabs({ domainId, onClose }: { domainId: string; onClose: () => void }) {
  const router = useRouter();
  const routerState = useRouterState();

  // Get current tab from URL search params
  const search = routerState.location.search as { tab?: string };
  const currentTab = (search.tab as DomainTab) || "page";

  // Format domain ID as page title (e.g., "my_domain" -> "My Domain")
  const pageTitle = domainId
    .split(/[_-]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

  const handleTabClick = (tab: DomainTab) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    router.navigate({
      to: "/domains/$domainId",
      params: { domainId },
      search: { tab },
    } as any);
  };

  // Primary tab (page) and secondary tabs (sheet, actions)
  const primaryTab = { id: "page" as DomainTab, label: pageTitle, icon: FileText };
  const secondaryTabs: { id: DomainTab; label: string; icon: typeof FileText }[] = [
    { id: "sheet", label: "Sheet", icon: Table2 },
    { id: "actions", label: "Actions", icon: Zap },
  ];

  // Primary tab with label, close button, and spec bar dropdown
  const renderPrimaryTab = (tab: { id: DomainTab; label: string; icon: typeof FileText }) => {
    const Icon = tab.icon;
    const isActive = currentTab === tab.id;

    return (
      <div key={tab.id} className="relative group/tab">
        <button
          onClick={() => handleTabClick(tab.id)}
          className={cn(
            "relative flex items-center gap-1.5 px-3 pt-1.5 pb-1.5 text-sm font-medium transition-colors whitespace-nowrap",
            "rounded-t-md border-x border-t",
            isActive
              ? [
                  "bg-background text-foreground",
                  "border-border/40",
                  "mb-[-1px] z-10",
                ]
              : [
                  "text-muted-foreground hover:text-foreground",
                  "border-transparent",
                  "hover:bg-muted/50",
                ]
          )}
        >
          <Icon className={cn(
            "h-4 w-4",
            isActive && "text-blue-500",
          )} />
          <span>{tab.label}</span>
          {/* Sync status indicator slot */}
          {isActive && <SyncStatusSlot />}
          <span
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="ml-1 p-0.5 rounded-sm text-muted-foreground/50 hover:text-muted-foreground hover:bg-accent/80 transition-colors"
          >
            <X weight="bold" className="h-3 w-3" />
          </span>
        </button>

        {/* SpecBar dropdown - shows on tab hover */}
        {isActive && (
          <div className={cn(
            "absolute top-full left-0 z-20",
            "opacity-0 pointer-events-none translate-y-1",
            "group-hover/tab:opacity-100 group-hover/tab:pointer-events-auto group-hover/tab:translate-y-0",
            "transition-all duration-150"
          )}>
            <div className="pt-1">
              <div className="bg-background border border-border/40 rounded-lg shadow-lg overflow-hidden">
                <SpecBarSlot />
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Secondary tabs - icon only with tooltip
  const renderSecondaryTab = (tab: { id: DomainTab; label: string; icon: typeof FileText }) => {
    const Icon = tab.icon;
    const isActive = currentTab === tab.id;

    return (
      <Tooltip key={tab.id}>
        <TooltipTrigger asChild>
          <button
            onClick={() => handleTabClick(tab.id)}
            className={cn(
              "relative flex items-center justify-center w-8 h-8 transition-colors",
              "rounded-md",
              isActive
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
          >
            <Icon className={cn(
              "h-4 w-4",
              isActive && tab.id === "sheet" && "text-emerald-500",
              isActive && tab.id === "actions" && "text-orange-500",
            )} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{tab.label}</TooltipContent>
      </Tooltip>
    );
  };

  return (
    <div className="flex items-end flex-1 gap-1" data-tauri-drag-region>
      {/* Page title tab with close button inside */}
      {renderPrimaryTab(primaryTab)}

      {/* Spacer pushes secondary tabs to right */}
      <div className="flex-1" />

      {/* Secondary tabs (Sheet, Actions) - icon only, right aligned */}
      <div className="flex items-center gap-0.5 mb-1">
        {secondaryTabs.map((tab) => renderSecondaryTab(tab))}
      </div>
    </div>
  );
}
