/**
 * Local Database Module
 *
 * Exports for in-browser SQLite with OPFS persistence.
 */

export {
  LocalDatabaseProvider,
  useLocalDatabase,
  useLocalQuery,
  useLocalMutation,
  useLocalSchema,
  type TableSchema,
} from "./LocalDatabaseProvider";

export { WebEditorProvider } from "./WebEditorProvider";
