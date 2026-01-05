/**
 * Hooks Index
 *
 * Re-exports all hooks for convenient importing.
 */

// UI utility hooks (from ui folder, takes precedence)
export * from "./ui";
// Background tasks
export * from "./useBackgroundTask";
export * from "./useChatState";
// Data hooks
export * from "./useDatabase";
// File picker
export * from "./useFilePicker";

// UI hooks
export * from "./useFullscreen";
export * from "./useHotkeys";
// Persistence hooks (replaces old useGit)
export * from "./usePersistence";
// Link navigation
export * from "./useLinkNavigation";
export * from "./useNavState";
// Core state hooks
export {
  type RuntimePhase,
  type RuntimeState,
  type TableSchema,
  useActiveWorkbookDirectory,
  useActiveWorkbookId,
  useDbReady,
  useDbSchema,
  useManifest,
  usePrefetchOnDbReady,
  useRuntimePort,
  useRuntimeProcess,
  useRuntimeState,
  type WorkbookManifest,
} from "./useRuntimeState";
// Server and settings
export { useServer, useServerHealth } from "./useServer";
export * from "./useSession";
export * from "./useSettings";
// Speech-to-text
export * from "./useStt";
export * from "./useTableData";
export * from "./useTableEditorProvider";
export * from "./useTablePreview";
// Thumbnails
export * from "./useThumbnails";
// tRPC
export * from "./useTRPC";
export {
  type CreatePageResult,
  type CreateWorkbookRequest,
  type Diagnostic,
  // WorkbookManifest is already exported from useRuntimeState
  type EvalResult,
  type ServiceStatus,
  useActiveRuntime,
  useCreatePage,
  useCreateWorkbook,
  useDeleteWorkbook,
  useEvalResult,
  useOpenWorkbook,
  useRuntimeEval,
  useStartWorkbookServer,
  useStopRuntime,
  useUpdateWorkbook,
  useWorkbook,
  useWorkbookDatabase,
  useWorkbooks,
  type Workbook,
  type WorkbookBlock,
  type WorkbookDatabaseInfo,
  type WorkbookSource,
} from "./useWorkbook";
// Workbook switcher
export * from "./useWorkbookSwitcher";
