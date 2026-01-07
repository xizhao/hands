/**
 * Web App Entry Point
 *
 * This is the main entry point for the web SPA. It uses TanStack Router
 * with browser history for routing.
 *
 * CODE SPLITTING STRATEGY
 * ========================
 * The landing page (/) must load quickly without heavy dependencies.
 * Heavy deps like SQLite, Pyodide, and the agent system are only needed
 * when viewing a workbook.
 *
 * How it works:
 * 1. This file (App.tsx) imports ONLY lightweight deps:
 *    - Local theme.ts instead of @hands/app (avoids pulling entire package)
 *    - Local Spinner.tsx instead of @hands/app LoadingState
 *    - React Query, TanStack Router, Sonner (small, cacheable)
 *
 * 2. WorkbookShell is lazy-loaded via React.lazy():
 *    - Contains all heavy imports (ChatPanel, agent API, SQLite providers)
 *    - Only fetched when navigating to /w/:workbookId routes
 *    - Shows Suspense fallback (loading spinner) while loading
 *
 * 3. Within WorkbookShell, child views are further lazy-loaded:
 *    - WorkbookIndex, PageView, TableView load on demand
 *    - ContentView component routes based on current path
 *
 * Why not import from @hands/app directly?
 *    Importing even a small utility from @hands/app causes Vite to bundle
 *    the entire package due to side effects and barrel exports.
 *    Local copies break this dependency chain.
 */

import { QueryClientProvider } from "@tanstack/react-query";
// Use lightweight imports to avoid pulling in heavy @hands/app deps on landing page
import { initTheme } from "@hands/app/light";
import { LoadingState } from "./components/Spinner";
import {
  Outlet,
  redirect,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { Toaster } from "sonner";
import { getLastOpenedWorkbookId } from "./shared/lib/storage";
import { WebShell } from "./shell/WebShell";
import { LandingSidebar } from "./shell/LandingSidebar";
import { LandingContent } from "./routes/LandingPage";
import { SettingsPopover } from "./components/SettingsPopover";
import { createLocalPlatformAdapter } from "./platform/LocalAdapter";
import { queryClient } from "./lib/queryClient";

// Initialize theme
initTheme();

// Lazy load workbook shell (contains all heavy deps: agent, SQLite, etc.)
// Store import function so we can preload it
const importWorkbookShell = () => import("./routes/workbook/WorkbookShell");
const WorkbookShell = lazy(importWorkbookShell);

// Preload heavy bundle when browser is idle
// Called from landing page to make workbook navigation instant
export function preloadWorkbookBundle() {
  if (typeof window === "undefined") return;

  const preload = () => {
    importWorkbookShell().catch(() => {
      // Ignore preload errors - will retry on actual navigation
    });
  };

  // Use requestIdleCallback for low-priority preload, fallback to setTimeout
  if ("requestIdleCallback" in window) {
    requestIdleCallback(preload, { timeout: 3000 });
  } else {
    setTimeout(preload, 500);
  }
}

// Loading fallback for workbook
function WorkbookLoader() {
  return (
    <div className="h-screen w-screen flex items-center justify-center bg-background">
      <LoadingState />
    </div>
  );
}

// ============================================================================
// Landing Page (lightweight)
// ============================================================================

function LandingLayout() {
  const [workbookCount, setWorkbookCount] = useState<number | null>(null);

  useEffect(() => {
    const adapter = createLocalPlatformAdapter();
    adapter.workbook.list().then((workbooks) => {
      setWorkbookCount(workbooks.length);
    });

    // Preload heavy workbook bundle while user is on landing page
    // This makes navigation to workbook routes instant
    preloadWorkbookBundle();
  }, []);

  const handleWorkbooksChange = useCallback((count: number) => {
    setWorkbookCount(count);
  }, []);

  // Only show sidebar if there are workbooks
  const sidebar = workbookCount && workbookCount > 0
    ? <LandingSidebar onWorkbooksChange={handleWorkbooksChange} />
    : undefined;

  return (
    <WebShell sidebar={sidebar} sidebarWidth={220} topbarActions={<SettingsPopover />}>
      <div className="h-full px-2 pb-2 pt-0.5">
        <div className="h-full border border-border/40 bg-background overflow-hidden shadow-sm rounded-lg flex items-center justify-center px-6">
          <LandingContent />
        </div>
      </div>
      <Toaster position="bottom-right" />
    </WebShell>
  );
}

// ============================================================================
// Workbook Route (lazy loaded)
// ============================================================================

function WorkbookRoute({ workbookId }: { workbookId: string }) {
  // Key the entire Suspense boundary to force full remount on workbook switch
  return (
    <Suspense key={workbookId} fallback={<WorkbookLoader />}>
      <WorkbookShell workbookId={workbookId} />
    </Suspense>
  );
}

// ============================================================================
// Routes
// ============================================================================

const rootRoute = createRootRoute({
  component: () => (
    <QueryClientProvider client={queryClient}>
      <Outlet />
    </QueryClientProvider>
  ),
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: LandingLayout,
});

const workbookRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/w/$workbookId",
  component: function WorkbookRouteComponent() {
    const { workbookId } = workbookRoute.useParams();
    return <WorkbookRoute workbookId={workbookId} />;
  },
  validateSearch: (search: Record<string, unknown>) => ({
    q: typeof search.q === "string" ? search.q : undefined,
  }),
});

// Child routes render inside WorkbookShell's Outlet
const workbookIndexRoute = createRoute({
  getParentRoute: () => workbookRoute,
  path: "/",
});

const workbookPageRoute = createRoute({
  getParentRoute: () => workbookRoute,
  path: "/pages/$pageId",
});

const workbookTableRoute = createRoute({
  getParentRoute: () => workbookRoute,
  path: "/tables/$tableId",
});

// Redirect routes (for backwards compat)
const pageRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/pages/$pageId",
  beforeLoad: async ({ params }) => {
    const workbookId = await getLastOpenedWorkbookId();
    if (workbookId) {
      throw redirect({
        to: "/w/$workbookId/pages/$pageId",
        params: { workbookId, pageId: params.pageId },
      });
    }
    throw redirect({ to: "/" });
  },
});

const tableRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/tables/$tableId",
  beforeLoad: async ({ params }) => {
    const workbookId = await getLastOpenedWorkbookId();
    if (workbookId) {
      throw redirect({
        to: "/w/$workbookId/tables/$tableId",
        params: { workbookId, tableId: params.tableId },
      });
    }
    throw redirect({ to: "/" });
  },
});

// Build route tree
const routeTree = rootRoute.addChildren([
  indexRoute,
  workbookRoute.addChildren([
    workbookIndexRoute,
    workbookPageRoute,
    workbookTableRoute,
  ]),
  pageRoute,
  tableRoute,
]);

// Create router
const router = createRouter({
  routeTree,
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

export function App() {
  return <RouterProvider router={router} />;
}
