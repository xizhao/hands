/**
 * Table Editor Provider Hook
 *
 * Adapts useTableData hook to the TableEditorDataProvider interface,
 * allowing the TableEditor component from @hands/editor to be used
 * with the desktop app's tRPC-based data layer.
 */

import { useMemo } from "react";
import type { TableEditorDataProvider } from "@hands/editor/table-editor";
import { useTableData, type UseTableDataOptions } from "./useTableData";

export interface UseTableEditorProviderOptions extends UseTableDataOptions {
  // All options from useTableData are supported
}

/**
 * Creates a TableEditorDataProvider from useTableData.
 *
 * @example
 * ```tsx
 * import { TableEditor } from '@hands/editor/table-editor';
 * import { useTableEditorProvider } from '@/hooks/useTableEditorProvider';
 *
 * function MyTableView({ tableName }) {
 *   const dataProvider = useTableEditorProvider({ table: tableName });
 *   return <TableEditor dataProvider={dataProvider} tableName={tableName} editable />;
 * }
 * ```
 */
export function useTableEditorProvider(
  options: UseTableEditorProviderOptions
): TableEditorDataProvider {
  const tableData = useTableData(options);

  return useMemo<TableEditorDataProvider>(
    () => ({
      // Schema
      getColumns: () => tableData.columns,
      getPrimaryKeyColumn: () => tableData.primaryKeyColumn,

      // Data access
      getTotalRows: () => tableData.totalRows,
      getLoadedCount: () => tableData.loadedCount,
      getRow: tableData.getRow,
      isRowLoaded: tableData.isRowLoaded,
      getRowId: tableData.getRowId,

      // Data loading
      loadRange: tableData.loadRange,

      // Write operations
      createRow: tableData.createRow,
      updateRow: tableData.updateRow,
      deleteRow: tableData.deleteRow,
      bulkUpdate: tableData.bulkUpdate,
      bulkDelete: tableData.bulkDelete,

      // Column operations
      renameColumn: tableData.renameColumn,
      changeColumnType: tableData.changeColumnType,
      addColumn: tableData.addColumn,
      dropColumn: tableData.dropColumn,

      // State
      isLoading: tableData.isLoading,
      isFetching: tableData.isFetching,
      isMutating: tableData.isMutating,

      // Cache management
      invalidateCache: tableData.invalidateCache,
    }),
    [tableData]
  );
}
