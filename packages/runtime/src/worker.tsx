import { navPages, pageRoutes, pages } from "@hands/pages";
import { type RouteMiddleware, render, route } from "rwsdk/router";
import { defineApp } from "rwsdk/worker";
import { actionRoutes } from "./actions/routes";
import { workflowRoutes } from "./actions/workflow-routes";
import { dbRoutes } from "./db/routes";
import { Document } from "./pages/Document";

/** Document wrapper that injects nav config */
const DocumentWithNav: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Document navPages={navPages} workbookTitle="Workbook">
    {children}
  </Document>
);

// Workflow bindings are exported for production CF Worker
// In dev mode, this exports empty bindings from the stub
// In production builds, the vite-plugin-workbook generates real workflow classes
export * from "./actions/workflows";

export const setCommonHeaders =
  (): RouteMiddleware =>
  ({ response, rw: { nonce } }) => {
    if (!import.meta.env.VITE_IS_DEV_SERVER) {
      // Forces browsers to always use HTTPS for a specified time period (2 years)
      response.headers.set(
        "Strict-Transport-Security",
        "max-age=63072000; includeSubDomains; preload",
      );
    }

    // Forces browser to use the declared content-type instead of trying to guess/sniff it
    response.headers.set("X-Content-Type-Options", "nosniff");

    // Stops browsers from sending the referring webpage URL in HTTP headers
    response.headers.set("Referrer-Policy", "no-referrer");

    // Explicitly disables access to specific browser features/APIs
    response.headers.set("Permissions-Policy", "geolocation=(), microphone=(), camera=()");

    // Defines trusted sources for content loading and script execution:
    // In dev mode, allow framing from editor sandbox (localhost:5167)
    const frameAncestors = import.meta.env.VITE_IS_DEV_SERVER
      ? "frame-ancestors 'self' http://localhost:5167 http://localhost:*"
      : "frame-ancestors 'self'";
    response.headers.set(
      "Content-Security-Policy",
      `default-src 'self'; script-src 'self' 'unsafe-eval' 'nonce-${nonce}' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https://www.react-grab.com; ${frameAncestors}; frame-src 'self' https://challenges.cloudflare.com; object-src 'none';`,
    );
  };

// Get the first page ID for root redirect
const firstPageId = Object.keys(pages)[0];

export default defineApp([
  setCommonHeaders(),
  // Health check endpoint for workbook-server polling
  route(
    "/health",
    () =>
      new Response(JSON.stringify({ status: "ok" }), {
        headers: { "Content-Type": "application/json" },
      }),
  ),
  // Database routes (dev only - for AI agent access)
  ...(import.meta.env.VITE_IS_DEV_SERVER ? dbRoutes : []),
  // Action routes (dev only - for action execution via local executor)
  ...(import.meta.env.VITE_IS_DEV_SERVER ? actionRoutes : []),
  // Workflow routes (production - for CF Workflow execution)
  ...(!import.meta.env.VITE_IS_DEV_SERVER ? workflowRoutes : []),
  // Root route - redirect to first page or return health check if no pages
  route("/", () => {
    if (firstPageId) {
      return new Response(null, {
        status: 302,
        headers: { Location: `/pages/${firstPageId}` },
      });
    }
    // Fallback for empty workbooks
    return new Response(JSON.stringify({ status: "ok", pages: 0 }), {
      headers: { "Content-Type": "application/json" },
    });
  }),
  // Pages wrapped in Document for proper hydration
  render(DocumentWithNav, [...pageRoutes]),
]);
