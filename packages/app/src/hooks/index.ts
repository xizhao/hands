/**
 * Hooks Index
 *
 * Re-exports all hooks for convenient importing.
 */

// Core state hooks
export {
  useRuntimeState,
  useRuntimeProcess,
  useRuntimePort,
  useActiveWorkbookId,
  useActiveWorkbookDirectory,
  useManifest,
  useDbSchema,
  useDbReady,
  usePrefetchOnDbReady,
  type RuntimePhase,
  type RuntimeState,
  type WorkbookManifest,
  type TableSchema,
} from "./useRuntimeState";

export {
  useActiveRuntime,
  useWorkbooks,
  useWorkbook,
  useCreateWorkbook,
  useUpdateWorkbook,
  useDeleteWorkbook,
  useOpenWorkbook,
  useStartWorkbookServer,
  useStopRuntime,
  useRuntimeEval,
  useEvalResult,
  useWorkbookDatabase,
  useCreatePage,
  type Workbook,
  type WorkbookBlock,
  type WorkbookSource,
  // WorkbookManifest is already exported from useRuntimeState
  type EvalResult,
  type Diagnostic,
  type ServiceStatus,
  type CreateWorkbookRequest,
  type WorkbookDatabaseInfo,
  type CreatePageResult,
} from "./useWorkbook";

export * from "./useSession";
export * from "./useSources";

// Server and settings
export { useServerHealth, useServer } from "./useServer";
export * from "./useSettings";

// UI hooks
export * from "./useFullscreen";
export * from "./useChatState";
export * from "./useNavState";
export * from "./useHotkeys";

// Data hooks
export * from "./useDatabase";
export * from "./useTableData";
export * from "./useTablePreview";
export * from "./useTableEditorProvider";

// Git hooks
export * from "./useGit";

// Background tasks
export * from "./useBackgroundTask";

// Source sync
export * from "./useSourceSync";

// Thumbnails
export * from "./useThumbnails";

// tRPC
export * from "./useTRPC";

// UI utility hooks (from ui folder, takes precedence)
export * from "./ui";
