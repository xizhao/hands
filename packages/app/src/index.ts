/**
 * Hands App Package
 *
 * Shared React application for desktop and web.
 * Platform-specific functionality is abstracted via the platform adapter.
 */

// Main App component
export { default as App, queryClient } from "./App";

// Platform abstraction (use this to provide platform-specific implementations)
export * from "./platform";

// Hooks (for direct use in platform-specific code)
export * from "./hooks";

// Router (for customization)
export { router } from "./router";

// tRPC Provider (for platform-specific wrapping)
export { TRPCProvider } from "./TRPCProvider";

// Theme utilities
export { initTheme, getTheme, setTheme, getThemeList } from "./lib/theme";

// Components (for direct use in platform-specific code)
export { SaveStatusIndicator } from "./components/SaveStatusIndicator";
export { WorkbookDropdown, type WorkbookDropdownProps } from "./components/WorkbookDropdown";
export { AttachmentMenu, type AttachmentMenuProps } from "./components/AttachmentMenu";
