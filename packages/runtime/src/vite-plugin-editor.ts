import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin, ViteDevServer } from "vite";

/**
 * Vite plugin that handles editor-specific routes.
 *
 * WHY WE NEED THIS:
 *
 * - We have an editor running in dev mode vite with a react instance with hmr disabled and a runtime running with a different react instance w HMR enabled
 *- Our editor renders a plate editor tree with a custom <RscBlock> node that serves as an RSC client — dynamically requesting rsc partials and renders in place and refreshes
 *- While rwsdk (our worker framework) supports RSC, it does so on the document level and not the partials level, therefore we have to:
 *- 1. Have an rsc endpoint to render our own flight renderer to get rsc partials
 *- 2. Have a client endpoint to proxy to shim in editor-compatible react for when the client renders
 *- Ideally this stuff is built in to rwsdk and we can do one clean shim, but alas life is not fair.
 *
 * This bypasses rwsdk's normal RSC/client component handling to give us
 * full control over how modules are served to the cross-origin editor context.
 *
 * Routes:
 * - /_client/* - Client component modules with React shimmed for editor
 * - /_rsc/* - RSC flight streams (proxies to /_editor/block/*)
 *
 * The /_client/* endpoint:
 * - Shims React imports to use window.__HANDS_REACT__ (editor's React)
 * - Strips HMR/Fast Refresh code (not needed cross-origin)
 * - Rewrites nested imports to also use /_client/*
 *
 * The /_rsc/* endpoint:
 * - Proxies to /_editor/block/* handled by the worker
 * - Provides a cleaner API for editor to fetch RSC streams
 */

// React shims - redirect to editor's React via window.__HANDS_REACT__
const REACT_SHIMS: Record<string, string> = {
  react: `
const R = window.__HANDS_REACT__?.React;
if (!R) throw new Error("[hands] window.__HANDS_REACT__.React not found");
export default R;
export const useState = R.useState;
export const useEffect = R.useEffect;
export const useCallback = R.useCallback;
export const useMemo = R.useMemo;
export const useRef = R.useRef;
export const useContext = R.useContext;
export const useReducer = R.useReducer;
export const useLayoutEffect = R.useLayoutEffect;
export const useImperativeHandle = R.useImperativeHandle;
export const useDebugValue = R.useDebugValue;
export const useDeferredValue = R.useDeferredValue;
export const useTransition = R.useTransition;
export const useId = R.useId;
export const useSyncExternalStore = R.useSyncExternalStore;
export const useInsertionEffect = R.useInsertionEffect;
export const createContext = R.createContext;
export const createElement = R.createElement;
export const cloneElement = R.cloneElement;
export const isValidElement = R.isValidElement;
export const Children = R.Children;
export const Fragment = R.Fragment;
export const StrictMode = R.StrictMode;
export const Suspense = R.Suspense;
export const lazy = R.lazy;
export const memo = R.memo;
export const forwardRef = R.forwardRef;
export const startTransition = R.startTransition;
export const Component = R.Component;
export const PureComponent = R.PureComponent;
export const createRef = R.createRef;
export const use = R.use;
export const useOptimistic = R.useOptimistic;
export const useActionState = R.useActionState;
export const cache = R.cache;
export const __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = R.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;
`,
  "react-dom": `
const RD = window.__HANDS_REACT__?.ReactDOM;
if (!RD) throw new Error("[hands] window.__HANDS_REACT__.ReactDOM not found");
export default RD;
export const createRoot = RD.createRoot;
export const hydrateRoot = RD.hydrateRoot;
export const createPortal = RD.createPortal;
export const flushSync = RD.flushSync;
export const unstable_batchedUpdates = RD.unstable_batchedUpdates;
export const version = RD.version;
export const __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = RD.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;
`,
  "react/jsx-runtime": `
const JSX = window.__HANDS_REACT__?.ReactJSXRuntime;
if (!JSX) throw new Error("[hands] window.__HANDS_REACT__.ReactJSXRuntime not found");
export const jsx = JSX.jsx;
export const jsxs = JSX.jsxs;
export const Fragment = JSX.Fragment;
`,
  "react/jsx-dev-runtime": `
const JSX = window.__HANDS_REACT__?.ReactJSXDevRuntime;
if (!JSX) throw new Error("[hands] window.__HANDS_REACT__.ReactJSXDevRuntime not found");
export const jsx = JSX.jsx;
export const jsxs = JSX.jsxs;
export const jsxDEV = JSX.jsxDEV;
export const Fragment = JSX.Fragment;
`,
};

interface EditorPluginOptions {
  workbookPath: string;
}

export function editorPlugin(options: EditorPluginOptions): Plugin {
  const { workbookPath } = options;
  let server: ViteDevServer;

  return {
    name: "hands:editor",
    apply: "serve",
    enforce: "pre", // Run before other plugins

    configureServer(viteServer) {
      server = viteServer;

      // Add middleware BEFORE Vite's built-in middleware
      return () => {
        server.middlewares.use(async (req, res, next) => {
          const url = req.url || "";

          // /_rsc/* - Proxy to /_editor/block/* (handled by worker)
          // e.g., /_rsc/MyBlock?props=... -> /_editor/block/MyBlock?props=...
          if (url.startsWith("/_rsc/")) {
            req.url = url.replace("/_rsc/", "/_editor/block/");
            next();
            return;
          }

          // /_client/* - Serve client components with React shimmed
          if (url.startsWith("/_client/")) {
            try {
              await handleClientModule(req, res, server, workbookPath);
            } catch (err) {
              console.error("[_client] Error:", err);
              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: String(err) }));
            }
            return;
          }

          next();
        });
      };
    },
  };
}

/**
 * Handle /_client/* requests - serve client components for editor
 */
async function handleClientModule(
  req: IncomingMessage,
  res: ServerResponse,
  server: ViteDevServer,
  workbookPath: string,
): Promise<void> {
  const url = new URL(req.url || "", "http://localhost");
  const modulePath = url.pathname.replace("/_client", "");

  // Check for React shim requests
  // e.g., /_client/__shim/react -> REACT_SHIMS["react"]
  if (modulePath.startsWith("/__shim/")) {
    const shimName = modulePath.replace("/__shim/", "");
    const shim = REACT_SHIMS[shimName];
    if (shim) {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/javascript; charset=utf-8");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cache-Control", "no-cache");
      res.end(shim.trim());
      return;
    }
  }

  // Resolve the actual file path
  // /_client/@fs/path/to/file.tsx -> /path/to/file.tsx
  // /_client/ui/button.tsx -> {workbookPath}/ui/button.tsx
  let filePath: string;
  if (modulePath.startsWith("/@fs/")) {
    filePath = modulePath.replace("/@fs", "");
  } else if (modulePath.startsWith("/node_modules/")) {
    // Dep from runtime's node_modules
    filePath = modulePath;
  } else {
    // Workbook file
    filePath = `${workbookPath}${modulePath}`;
  }

  try {
    // Use Vite's transform pipeline to get the compiled module
    const result = await server.transformRequest(filePath, { ssr: false });

    if (!result) {
      res.statusCode = 404;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: `Module not found: ${modulePath}` }));
      return;
    }

    let code = result.code;

    // Rewrite imports to use our editor client endpoint
    code = rewriteImports(code, workbookPath);

    // Strip HMR/Fast Refresh code
    code = stripHmrCode(code);

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/javascript; charset=utf-8");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "no-cache");
    res.end(code);
  } catch (err) {
    console.error(`[editor-proxy] Failed to transform ${filePath}:`, err);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: `Transform failed: ${String(err)}` }));
  }
}

/**
 * Rewrite imports to use /_client/* endpoint
 */
function rewriteImports(code: string, _workbookPath: string): string {
  // Rewrite React imports to use shims
  // Matches: "react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"
  // Also matches Vite pre-bundled versions in node_modules/.vite/deps/
  code = code.replace(
    /from\s+["'](?:\/node_modules\/\.vite\/deps(?:_ssr)?\/)?(?:\.\.\/)?(?:node_modules\/\.vite\/deps(?:_ssr)?\/)?(react(?:[-_]dom)?(?:[-_]jsx[-_](?:dev[-_])?runtime)?)(?:\.js)?(?:\?[^"']*)?["']/g,
    (_match, pkg) => {
      // Normalize the package name
      const normalizedPkg = pkg
        .replace(/_/g, "-")
        .replace("react-jsx", "react/jsx")
        .replace("react-dom", "react-dom");
      return `from "/_client/__shim/${normalizedPkg}"`;
    },
  );

  // Rewrite absolute /@fs/ paths
  code = code.replace(
    /from\s+["']\/@fs(\/[^"']+)["']/g,
    (_match, path) => `from "/_client/@fs${path}"`,
  );

  // Rewrite absolute paths (starting with /) - skip paths already using /_client/
  code = code.replace(
    /from\s+["'](\/(?!_client\/)[^"']+)["']/g,
    (_match, path) => `from "/_client${path}"`,
  );

  // Rewrite dynamic imports with absolute paths
  code = code.replace(
    /import\(["'](\/(?!_client\/)[^"']+)["']\)/g,
    (_match, path) => `import("/_client${path}")`,
  );

  // Rewrite dynamic imports with /@fs/ paths
  code = code.replace(
    /import\(["']\/@fs(\/[^"']+)["']\)/g,
    (_match, path) => `import("/_client/@fs${path}")`,
  );

  return code;
}

/**
 * Strip HMR and Fast Refresh code from module
 */
function stripHmrCode(code: string): string {
  // Remove import.meta.hot checks and blocks
  code = code.replace(/if\s*\(\s*import\.meta\.hot\s*\)\s*\{[^}]*\}/g, "/* HMR stripped */");

  // Remove RefreshRuntime calls
  code = code.replace(/\$RefreshReg\$\([^)]*\);?/g, "");
  code = code.replace(/\$RefreshSig\$\([^)]*\);?/g, "");

  // Remove preamble-related code
  code = code.replace(/import\s+["']virtual:vite-preamble["'];?/g, "");
  code = code.replace(/import\s+RefreshRuntime\s+from\s+["']\/@react-refresh["'];?/g, "");

  // Remove __vite_plugin_react_preamble_installed__ checks
  code = code.replace(/if\s*\(.*__vite_plugin_react_preamble_installed__.*\)\s*\{[^}]*\}/g, "");

  return code;
}
