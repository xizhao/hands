/**
 * Server Hook
 *
 * Provides server health status and restart functionality.
 * Uses the platform adapter for cross-platform compatibility.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePlatform } from "../platform";
import { api } from "@/lib/api";

export function useServerHealth() {
  const platform = usePlatform();
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

  // Restart mutation - only available on desktop
  const restartMutation = useMutation({
    mutationFn: async () => {
      if (!platform.server?.restart) {
        throw new Error("Server restart not available on this platform");
      }
      const result = await platform.server.restart();
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
    canRestart: !!platform.server?.restart,
  };
}

/**
 * Alias for backward compatibility
 */
export const useServer = useServerHealth;
