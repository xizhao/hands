import { QueryClient, QueryClientProvider, MutationCache } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster, toast } from "sonner";
import { router } from "@/router";

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
};

function getMutationLabel(mutationKey: unknown): string | null {
  if (!Array.isArray(mutationKey)) return null;
  const key = mutationKey.slice(0, 2).join(".");
  return mutationLabels[key] ?? null;
}

// Export queryClient so SSE handler can access it
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5000,
      refetchOnWindowFocus: false,
    },
  },
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      // Only show toast for mutations that don't handle errors themselves
      if (mutation.options.onError) return;

      const action = getMutationLabel(mutation.options.mutationKey);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      // Build descriptive message
      const message = action
        ? `Failed to ${action}: ${errorMessage}`
        : errorMessage;

      toast.error(message);
    },
  }),
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <RouterProvider router={router} />
        <Toaster
          position="top-right"
          offset={16}
          gap={8}
          toastOptions={{
            unstyled: true,
            classNames: {
              toast: "flex items-center gap-2 px-3 py-2 rounded-lg text-xs bg-popover border border-border text-popover-foreground shadow-lg max-w-xs mt-12",
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
    </QueryClientProvider>
  );
}
