/**
 * Table Preview Hook - Fetches schema and sample data for table previews
 *
 * Used for hover previews in the sidebar to show table structure
 * and a few sample rows without loading the full table.
 */

import { useQuery } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc";

export interface TableColumn {
  name: string;
  type: string;
}

export interface TablePreviewData {
  columns: TableColumn[];
  sampleRows: Record<string, unknown>[];
  totalRows: number;
}

const SAMPLE_ROWS_LIMIT = 3;

export function useTablePreview(tableName: string | undefined) {
  const dbQuery = trpc.db.query.useMutation();

  return useQuery({
    queryKey: ["tablePreview", tableName],
    queryFn: async (): Promise<TablePreviewData | null> => {
      if (!tableName) return null;

      try {
        // Get column info using PRAGMA
        const schemaResult = await dbQuery.mutateAsync({
          sql: `PRAGMA table_info("${tableName}")`,
        });

        const columns: TableColumn[] = (
          schemaResult.rows as Array<{ name: string; type: string }>
        ).map((row) => ({
          name: row.name,
          type: row.type || "TEXT",
        }));

        // Get row count
        const countResult = await dbQuery.mutateAsync({
          sql: `SELECT COUNT(*) as count FROM "${tableName}"`,
        });
        const totalRows = (countResult.rows[0] as { count: number })?.count ?? 0;

        // Get sample rows
        const sampleResult = await dbQuery.mutateAsync({
          sql: `SELECT * FROM "${tableName}" LIMIT ${SAMPLE_ROWS_LIMIT}`,
        });
        const sampleRows = sampleResult.rows as Record<string, unknown>[];

        return { columns, sampleRows, totalRows };
      } catch (error) {
        console.error("Failed to fetch table preview:", error);
        return null;
      }
    },
    enabled: !!tableName,
    staleTime: 30000, // Cache for 30 seconds
    gcTime: 60000, // Keep in cache for 1 minute
  });
}
