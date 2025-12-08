import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
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

  // Restart mutation for better state tracking
  const restartMutation = useMutation({
    mutationFn: async () => {
      const result = await invoke<HealthCheck>("restart_server");
      console.log("Restart server result:", result);
      return result;
    },
    onSuccess: () => {
      // Invalidate health query to refetch
      queryClient.invalidateQueries({ queryKey: ["health"] });
      // Also invalidate agents and tools since they may have changed
      queryClient.invalidateQueries({ queryKey: ["agents"] });
      queryClient.invalidateQueries({ queryKey: ["tools"] });
    },
  });

  const restartServer = async () => {
    return restartMutation.mutateAsync();
  };

  return {
    isConnected: health.isSuccess,
    isConnecting: health.isPending || (health.isError && health.isFetching),
    isRestarting: restartMutation.isPending,
    error: health.error,
    restartServer,
  };
}
