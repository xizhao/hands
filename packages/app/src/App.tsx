/**
 * App Entry Component
 *
 * Main React application component that provides:
 * - React Query client and provider
 * - tRPC provider (gated on runtime connection)
 * - Toast notifications
 * - Tooltip provider
 * - Router
 *
 * Note: PlatformProvider must be added by the platform-specific entry points
 * (desktop/main.tsx or web/main.tsx) that wrap this App component.
 */

import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { Toaster, toast } from "sonner";
import { TRPCProvider } from "./TRPCProvider";
import { TooltipProvider } from "./components/ui/tooltip";
import { useActiveRuntime } from "./hooks/useWorkbook";
import { router } from "./router";

// Map mutation keys to user-friendly action names
const mutationLabels: Record<string, string> = {
  "workbook.create": "create workbook",
  "workbook.update": "update workbook",
  "workbook.delete": "delete workbook",
  "workbook.open": "open workbook",
  "runtime.start": "start runtime",
  "runtime.stop": "stop runtime",
  "runtime.query": "run query",
  "runtime.eval": "evaluate code",
  "page.create": "create page",
  "source.add": "add source",
  "file.import": "import file",
  "session.create": "create session",
  "session.delete": "delete session",
  "session.abort": "abort session",
  "message.send": "send message",
  "permission.respond": "respond to permission",
};

function getMutationLabel(mutationKey: unknown): string | null {
  if (!Array.isArray(mutationKey)) return null;
  const key = mutationKey.slice(0, 2).join(".");
  return mutationLabels[key] ?? null;
}

/**
 * Check if an error is a connection error (server not ready yet)
 */
function isConnectionError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return (
      msg.includes("fetch failed") ||
      msg.includes("network") ||
      msg.includes("econnrefused") ||
      msg.includes("unable to connect") ||
      msg.includes("failed to fetch")
    );
  }
  return false;
}

// Export queryClient so SSE handler can access it
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5000,
      refetchOnWindowFocus: false,
      // Retry connection errors silently during boot
      retry: (failureCount, error) => {
        // Don't retry non-connection errors
        if (!isConnectionError(error)) return false;
        // Retry up to 10 times for connection errors (covers ~30s boot time)
        return failureCount < 10;
      },
      retryDelay: (attemptIndex) => Math.min(1000 * (attemptIndex + 1), 5000),
    },
  },
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      // Only show toast for mutations that don't handle errors themselves
      if (mutation.options.onError) return;

      const action = getMutationLabel(mutation.options.mutationKey);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      // Build descriptive message
      const message = action ? `Failed to ${action}: ${errorMessage}` : errorMessage;

      toast.error(message);
    },
  }),
});

/**
 * Shared UI shell (Toaster, Tooltips) - no tRPC dependency
 */
function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider>
      {children}
      <Toaster
        position="bottom-right"
        offset={16}
        gap={8}
        toastOptions={{
          unstyled: true,
          classNames: {
            toast:
              "flex items-center gap-2 px-3 py-2 rounded-lg text-xs bg-popover border border-border text-popover-foreground shadow-lg max-w-xs",
            error: "text-red-400 [&>svg]:text-red-400",
            success: "text-green-400 [&>svg]:text-green-400",
            title: "font-medium",
            description: "text-muted-foreground",
            actionButton: "bg-primary text-primary-foreground px-2 py-1 rounded text-xs",
            cancelButton: "bg-muted text-muted-foreground px-2 py-1 rounded text-xs",
          },
        }}
        style={{ zIndex: 9999 }}
      />
    </TooltipProvider>
  );
}

/**
 * Inner app content - gates tRPC on runtime connection
 *
 * tRPC is only available when runtime is connected. The router renders
 * regardless, allowing workbook initialization to happen without tRPC.
 * Components using tRPC must be inside routes that only render when connected.
 */
function AppContent() {
  const { data: runtime } = useActiveRuntime();
  const runtimePort = runtime?.runtime_port ?? null;

  // Always render the router - workbook init logic needs it
  // tRPC provider only mounts when runtime is connected
  if (runtimePort) {
    return (
      <TRPCProvider queryClient={queryClient} runtimePort={runtimePort}>
        <AppShell>
          <RouterProvider router={router} />
        </AppShell>
      </TRPCProvider>
    );
  }

  // No runtime yet - render without tRPC
  // Workbook picker and initialization work via platform adapter
  return (
    <AppShell>
      <RouterProvider router={router} />
    </AppShell>
  );
}

/**
 * Main App Component
 *
 * Must be wrapped with PlatformProvider by the entry point.
 */
export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
    </QueryClientProvider>
  );
}
