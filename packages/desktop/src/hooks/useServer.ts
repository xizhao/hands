import { useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { api } from "@/lib/api";

interface HealthCheck {
  healthy: boolean;
  message: string;
}

export function useServer() {
  const queryClient = useQueryClient();

  // Health check query - polls the server
  const health = useQuery({
    queryKey: ["health"],
    queryFn: api.health,
    retry: true,
    retryDelay: (attemptIndex) => Math.min(1000 * (attemptIndex + 1), 5000),
    refetchInterval: (query) => (query.state.data ? 30000 : 2000),
    staleTime: 5000,
  });

  const restartServer = async () => {
    try {
      // Call Tauri to restart the server process
      const result = await invoke<HealthCheck>("restart_server");
      console.log("Restart server result:", result);

      // Invalidate health query to refetch
      queryClient.invalidateQueries({ queryKey: ["health"] });

      return result;
    } catch (error) {
      console.error("Failed to restart server:", error);
      throw error;
    }
  };

  return {
    isConnected: health.isSuccess,
    isConnecting: health.isPending || (health.isError && health.isFetching),
    error: health.error,
    restartServer,
  };
}
