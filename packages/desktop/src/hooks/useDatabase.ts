import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

export interface DatabaseStats {
  size_bytes: number;
  size_formatted: string;
  table_count: number;
  connection_count: number;
}

export interface DatabaseStatus {
  connected: boolean;
  message: string;
  port: number;
  database: string;
  stats: DatabaseStats | null;
}

export function useDatabase() {
  const status = useQuery({
    queryKey: ["database-status"],
    queryFn: () => invoke<DatabaseStatus>("get_database_status"),
    retry: true,
    retryDelay: (attemptIndex) => Math.min(1000 * (attemptIndex + 1), 5000),
    refetchInterval: (query) => (query.state.data?.connected ? 30000 : 5000),
    staleTime: 5000,
  });

  return {
    isConnected: status.data?.connected ?? false,
    isConnecting: status.isPending,
    error: status.error,
    status: status.data,
    refetch: status.refetch,
  };
}
