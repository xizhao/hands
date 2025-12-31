/**
 * Hands App Package
 *
 * Shared React application for desktop and web.
 * Platform-specific functionality is abstracted via the platform adapter.
 */

// Main App component
export { default as App, queryClient } from "./App";
export { AttachmentMenu, type AttachmentMenuProps } from "./components/AttachmentMenu";
export { ChatInput, type ChatInputRef } from "./components/chat/ChatInput";
// Chat components
export { ChatPanel, type ChatPanelProps } from "./components/chat/ChatPanel";
export { type SessionStatus, StatusDot } from "./components/chat/StatusDot";
export { ThreadList } from "./components/chat/ThreadList";

// Components (for direct use in platform-specific code)
export { SaveStatusIndicator } from "./components/SaveStatusIndicator";
export { WorkbookDropdown, type WorkbookDropdownProps } from "./components/WorkbookDropdown";
// Hooks (for direct use in platform-specific code)
export * from "./hooks";
// Theme utilities
export { getTheme, getThemeList, initTheme, setTheme } from "./lib/theme";
// Platform abstraction (use this to provide platform-specific implementations)
export * from "./platform";
// Router (for customization)
export { router } from "./router";
// tRPC Provider (for platform-specific wrapping)
export { TRPCProvider } from "./TRPCProvider";
