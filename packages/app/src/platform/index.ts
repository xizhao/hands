/**
 * Platform Abstraction Layer
 *
 * Exports all platform-related types and utilities.
 * Use this to access platform-specific functionality in a cross-platform way.
 */

export type { PlatformProviderProps } from "./context";

// Context and hooks
export {
  PlatformProvider,
  useAuth,
  useCapabilities,
  useCapability,
  useFileSystem,
  useIsDesktop,
  useIsWeb,
  usePlatform,
  useWindow,
} from "./context";
// Types
export type {
  FilePickerOptions,
  PlatformAdapter,
  PlatformCapabilities,
  RuntimeConnection,
  RuntimeStatus,
  User,
  Workbook,
} from "./types";
