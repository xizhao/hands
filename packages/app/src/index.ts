/**
 * Hands App Package
 *
 * Shared component library for desktop and web.
 * Platform-specific functionality is abstracted via the platform adapter.
 *
 * Usage:
 * - Desktop: Use `App` component (includes router with memory history)
 * - Web: Use components directly (NotebookShell, ChatPanel, etc.)
 *        and create your own router with browser history
 */

// Desktop App (includes RouterProvider with memory history - NOT for web)
export { default as App, queryClient } from "./App";

// Chat components
export { AttachmentMenu, type AttachmentMenuProps } from "./components/AttachmentMenu";
export { ChatInput, type ChatInputRef } from "./components/chat/ChatInput";
export { ChatPanel, type ChatPanelProps, type EditorContext } from "./components/chat/ChatPanel";
export { type SessionStatus, StatusDot } from "./components/chat/StatusDot";
export { ThreadList } from "./components/chat/ThreadList";

// Shell components (shared layout primitives)
export { Topbar, type TopbarProps } from "./components/shell/Topbar";
export { ResizableLayout, type ResizableLayoutProps } from "./components/shell/ResizableLayout";

// Workbook components (for use without full App)
export { NotebookShell } from "./components/workbook/NotebookShell";
export { ContentHeader } from "./components/workbook/ContentHeader";
export { ContentTabBar } from "./components/workbook/ContentTabBar";
export { EmptyWorkbookState } from "./components/workbook/EmptyWorkbookState";

// Content components (for page/table routes)
export { PageEditor } from "./components/page-editor/PageEditor";
export { SheetTab } from "./components/domain/tabs/SheetTab";

// Other components
export { SaveStatusIndicator } from "./components/SaveStatusIndicator";
export { WorkbookDropdown, type WorkbookDropdownProps } from "./components/WorkbookDropdown";
export {
  HeaderActionsProvider,
  SyncStatusSlot,
  SyncStatusPortal,
  SpecBarSlot,
  SpecBarPortal,
} from "./components/workbook/HeaderActionsContext";

// Hooks
export * from "./hooks";

// Theme utilities (use these - don't duplicate)
export { getTheme, getThemeList, initTheme, setTheme, THEMES, type Theme } from "./lib/theme";

// Platform abstraction
export * from "./platform";

// Agent readiness context
export { AgentReadyProvider, useAgentReady } from "./context/AgentReadyContext";

// Router (memory-based for desktop, web should create own)
export { router } from "./router";

// Route tree (for extending or composing routes)
export { routeTree } from "./routeTree.gen";

// tRPC Provider
export { TRPCProvider } from "./TRPCProvider";

// UI primitives
export { cn } from "./lib/utils";
export { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "./components/ui/tooltip";
export { Spinner, LoadingState } from "./components/ui/spinner";
export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "./components/ui/dropdown-menu";

// Route types and utilities
export {
  type RouteType,
  type RouteConfig,
  ROUTE_CONFIGS,
  ROUTE_PREFIXES,
  normalizePageId,
  getPageIdFromPath,
  normalizeRouteId,
} from "./types/routes";
