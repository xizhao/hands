import { route, RouteMiddleware } from "rwsdk/router";
import { defineApp } from "rwsdk/worker";
import { handleBlockGet } from "./blocks/render";
import { runWithDbMode, Database } from "./db/dev";

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
    response.headers.set(
      "Content-Security-Policy",
      `default-src 'self'; script-src 'self' 'unsafe-eval' 'nonce-${nonce}' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; frame-ancestors 'self'; frame-src 'self' https://challenges.cloudflare.com; object-src 'none';`
    );
  };

export default defineApp([
  setCommonHeaders(),
  route("/blocks/*", {
    get: (args) => {
      // Blocks are read-only - wrap in block mode context
      return runWithDbMode("block", () => handleBlockGet(args));
    },
  }),
  // TODO: Add action routes with runWithDbMode("action", ...)
  // route("/actions/*", {
  //   post: (args) => runWithDbMode("action", () => handleAction(args)),
  // }),
]);
