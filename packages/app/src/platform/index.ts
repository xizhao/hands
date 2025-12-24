/**
 * Platform Abstraction Layer
 *
 * Exports all platform-related types and utilities.
 * Use this to access platform-specific functionality in a cross-platform way.
 */

// Types
export type {
  Workbook,
  RuntimeConnection,
  RuntimeStatus,
  User,
  FilePickerOptions,
  PlatformCapabilities,
  PlatformAdapter,
} from "./types";

// Context and hooks
export {
  PlatformProvider,
  usePlatform,
  useIsDesktop,
  useIsWeb,
  useCapability,
  useCapabilities,
  useAuth,
  useWindow,
  useFileSystem,
} from "./context";
export type { PlatformProviderProps } from "./context";
