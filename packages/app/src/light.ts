/**
 * Lightweight exports from @hands/app
 *
 * This entry point exports only utilities and simple components
 * that don't pull in heavy dependencies (editor, agent, etc.).
 *
 * Use this for landing pages and other lightweight contexts.
 * Import from "@hands/app/light" instead of "@hands/app".
 *
 * Included:
 * - cn: Tailwind class merging utility
 * - useResizable: Hook for resizable panels
 * - Topbar: Simple navigation bar component
 * - initTheme, getTheme, setTheme: Theme utilities
 * - Basic UI components (Spinner, DropdownMenu, etc.)
 */

// Utilities
export { cn } from "./lib/utils";
export { useResizable, type UseResizableOptions, type UseResizableReturn } from "./hooks/useResizable";

// Theme
export { initTheme, getTheme, setTheme, getThemeList, THEMES, type Theme, type ThemeColors } from "./lib/theme";

// Simple components (no heavy deps)
export { Topbar, type TopbarProps } from "./components/shell/Topbar";
export { Spinner, LoadingState } from "./components/ui/spinner";

// Re-export basic UI from Radix (lightweight)
export {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "./components/ui/dropdown-menu";
