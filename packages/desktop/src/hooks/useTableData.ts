import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useRuntimePort } from "./useWorkbook"

export interface TableQueryResult {
  rows: Record<string, unknown>[]
  rowCount: number
}

interface QueryOptions {
  tableName: string
  limit?: number
  offset?: number
  orderBy?: string
  orderDir?: "asc" | "desc"
}

/**
 * Hook to fetch table data with pagination
 */
export function useTableData({
  tableName,
  limit = 100,
  offset = 0,
  orderBy,
  orderDir = "asc",
}: QueryOptions) {
  const port = useRuntimePort()

  return useQuery({
    queryKey: ["table-data", tableName, limit, offset, orderBy, orderDir],
    queryFn: async (): Promise<TableQueryResult> => {
      if (!port) throw new Error("Runtime not connected")

      // Build query with pagination
      let query = `SELECT * FROM "${tableName}"`
      if (orderBy) {
        query += ` ORDER BY "${orderBy}" ${orderDir.toUpperCase()}`
      }
      query += ` LIMIT ${limit} OFFSET ${offset}`

      const response = await fetch(`http://localhost:${port}/postgres/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to fetch table data")
      }

      return response.json()
    },
    enabled: !!port && !!tableName,
    staleTime: 5000,
  })
}

/**
 * Hook to get total row count for a table
 */
export function useTableRowCount(tableName: string) {
  const port = useRuntimePort()

  return useQuery({
    queryKey: ["table-count", tableName],
    queryFn: async (): Promise<number> => {
      if (!port) throw new Error("Runtime not connected")

      const query = `SELECT COUNT(*) as count FROM "${tableName}"`
      const response = await fetch(`http://localhost:${port}/postgres/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to get row count")
      }

      const result = await response.json()
      return Number(result.rows?.[0]?.count ?? 0)
    },
    enabled: !!port && !!tableName,
    staleTime: 10000,
  })
}

/**
 * Hook to run arbitrary SQL queries
 */
export function useQueryExec() {
  const port = useRuntimePort()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (query: string): Promise<TableQueryResult> => {
      if (!port) throw new Error("Runtime not connected")

      const response = await fetch(`http://localhost:${port}/postgres/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Query failed")
      }

      return response.json()
    },
    onSuccess: () => {
      // Invalidate table data caches after mutations
      queryClient.invalidateQueries({ queryKey: ["table-data"] })
      queryClient.invalidateQueries({ queryKey: ["table-count"] })
      queryClient.invalidateQueries({ queryKey: ["db-schema"] })
    },
  })
}
