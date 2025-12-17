import { route, render, RouteMiddleware } from "rwsdk/router";
import { defineApp } from "rwsdk/worker";
import { handleBlockGet, loadBlock, getBlockBuildError } from "./blocks/render";
import { Page } from "./pages/Page";
import { BlockPreview, BlockErrorPreview } from "./blocks/BlockPreview";
import { pages, pageRoutes } from "@hands/pages";
import { runWithDbMode, Database } from "./db/dev";
import { dbRoutes } from "./db/routes";

// Export Durable Object for wrangler
export { Database };

export const setCommonHeaders =
  (): RouteMiddleware =>
  ({ response, rw: { nonce } }) => {
    if (!import.meta.env.VITE_IS_DEV_SERVER) {
      // Forces browsers to always use HTTPS for a specified time period (2 years)
      response.headers.set(
        "Strict-Transport-Security",
        "max-age=63072000; includeSubDomains; preload"
      );
    }

    // Forces browser to use the declared content-type instead of trying to guess/sniff it
    response.headers.set("X-Content-Type-Options", "nosniff");

    // Stops browsers from sending the referring webpage URL in HTTP headers
    response.headers.set("Referrer-Policy", "no-referrer");

    // Explicitly disables access to specific browser features/APIs
    response.headers.set(
      "Permissions-Policy",
      "geolocation=(), microphone=(), camera=()"
    );

    // Defines trusted sources for content loading and script execution:
    // In dev mode, allow framing from editor sandbox (localhost:5167)
    const frameAncestors = import.meta.env.VITE_IS_DEV_SERVER
      ? "frame-ancestors 'self' http://localhost:5167 http://localhost:*"
      : "frame-ancestors 'self'";
    response.headers.set(
      "Content-Security-Policy",
      `default-src 'self'; script-src 'self' 'unsafe-eval' 'nonce-${nonce}' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https://www.react-grab.com; ${frameAncestors}; frame-src 'self' https://challenges.cloudflare.com; object-src 'none';`
    );
  };

// Get the first page ID for root redirect
const firstPageId = Object.keys(pages)[0];

export default defineApp([
  setCommonHeaders(),
  // Health check endpoint for workbook-server polling
  route("/health", () =>
    new Response(JSON.stringify({ status: "ok" }), {
      headers: { "Content-Type": "application/json" },
    })
  ),
  // Database routes (dev only - for AI agent access)
  ...(import.meta.env.VITE_IS_DEV_SERVER ? dbRoutes : []),
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
  route("/_editor/blocks/*", {
    get: (args) => {
      // Blocks are read-only - wrap in block mode context
      // This endpoint returns raw RSC Flight streams for the editor
      return runWithDbMode("block", () => handleBlockGet(args));
    },
  }),
  // Pages use rwsdk's render() for proper RSC/SSR handling
  ...render(Page, pageRoutes),
  // TODO: Add action routes with runWithDbMode("action", ...)
  // route("/actions/*", {
  //   post: (args) => runWithDbMode("action", () => handleAction(args)),
  // }),

  // Block preview with full HTML/SSR (for browser viewing)
  ...render(BlockPreview, [
    route("/preview/*", async ({ params }) => {
      const blockId = params.$0;

      // Check for build error first - show error component instead of crashing
      const buildError = getBlockBuildError(blockId);
      if (buildError) {
        return <BlockErrorPreview error={buildError} blockId={blockId} isBuildError />;
      }

      try {
        const Block = await loadBlock(blockId);
        return runWithDbMode("block", () => <Block />);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return <BlockErrorPreview error={message} blockId={blockId} />;
      }
    }),
  ]),
]);
