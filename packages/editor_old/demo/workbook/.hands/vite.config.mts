import { defineConfig, Plugin } from "vite";
import { redwood } from "rwsdk/vite";
import { cloudflare } from "@cloudflare/vite-plugin";

// React modules to exclude from pre-bundling and mark as external for client environment
// The editor provides these via import map, so runtime should not bundle them
const REACT_EXTERNALS = [
  "react",
  "react-dom",
  "react-dom/client",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
];

/**
 * Plugin to provide React from window.__HANDS_REACT__ for client environment.
 *
 * Uses virtual modules that read from the editor's React singleton.
 * The editor sets window.__HANDS_REACT__ before loading any RSC client components.
 *
 * This approach avoids Vite's pre-bundled deps entirely for React.
 */
function reactGlobalPlugin(): Plugin {
  const reactModules = new Set(REACT_EXTERNALS);

  return {
    name: "hands-react-global",
    enforce: "pre",



    resolveId(id, _importer, options) {
      // @ts-ignore
      const env = this.environment?.name || options?.environment?.name;
      if (env === "worker" || env === "ssr") return null;

      if (reactModules.has(id)) {
        return "\0hands-react:" + id;
      }
    },

    load(id, options) {
      if (!id.startsWith("\0hands-react:")) return null;

      // @ts-ignore
      const env = this.environment?.name || options?.environment?.name;
      if (env === "worker" || env === "ssr") return null;

      const moduleId = id.slice("\0hands-react:".length);

      if (moduleId === "react") {
        return `
const R = window.__HANDS_REACT__?.React;
if (!R) throw new Error("[hands] window.__HANDS_REACT__.React not found");
export default R;
export const Children = R.Children;
export const Component = R.Component;
export const Fragment = R.Fragment;
export const Profiler = R.Profiler;
export const PureComponent = R.PureComponent;
export const StrictMode = R.StrictMode;
export const Suspense = R.Suspense;
export const cloneElement = R.cloneElement;
export const createContext = R.createContext;
export const createElement = R.createElement;
export const createRef = R.createRef;
export const forwardRef = R.forwardRef;
export const isValidElement = R.isValidElement;
export const lazy = R.lazy;
export const memo = R.memo;
export const startTransition = R.startTransition;
export const useCallback = R.useCallback;
export const useContext = R.useContext;
export const useDebugValue = R.useDebugValue;
export const useDeferredValue = R.useDeferredValue;
export const useEffect = R.useEffect;
export const useId = R.useId;
export const useImperativeHandle = R.useImperativeHandle;
export const useInsertionEffect = R.useInsertionEffect;
export const useLayoutEffect = R.useLayoutEffect;
export const useMemo = R.useMemo;
export const useReducer = R.useReducer;
export const useRef = R.useRef;
export const useState = R.useState;
export const useSyncExternalStore = R.useSyncExternalStore;
export const useTransition = R.useTransition;
export const version = R.version;
export const use = R.use;
export const useOptimistic = R.useOptimistic;
export const useActionState = R.useActionState;
export const cache = R.cache;
`;
      }

      if (moduleId === "react-dom" || moduleId === "react-dom/client") {
        return `
const RD = window.__HANDS_REACT__?.ReactDOM;
if (!RD) throw new Error("[hands] window.__HANDS_REACT__.ReactDOM not found");
export default RD;
export const createPortal = RD.createPortal;
export const flushSync = RD.flushSync;
export const createRoot = RD.createRoot;
export const hydrateRoot = RD.hydrateRoot;
export const version = RD.version;
`;
      }

      if (moduleId === "react/jsx-runtime") {
        return `
const JSX = window.__HANDS_REACT__?.ReactJSXRuntime;
if (!JSX) throw new Error("[hands] window.__HANDS_REACT__.ReactJSXRuntime not found");
export const jsx = JSX.jsx;
export const jsxs = JSX.jsxs;
export const Fragment = JSX.Fragment;
`;
      }

      if (moduleId === "react/jsx-dev-runtime") {
        return `
const JSX = window.__HANDS_REACT__?.ReactJSXDevRuntime;
if (!JSX) throw new Error("[hands] window.__HANDS_REACT__.ReactJSXDevRuntime not found");
export const jsx = JSX.jsx;
export const jsxs = JSX.jsxs;
export const jsxDEV = JSX.jsxDEV;
export const Fragment = JSX.Fragment;
`;
      }
    },
  };
}

export default defineConfig({
  plugins: [
    reactGlobalPlugin(),
    cloudflare({
      viteEnvironment: { name: "worker" },
    }),
    redwood(),
  ],
  optimizeDeps: {
    // Disable discovery but keep pre-bundling for deps that are explicitly included.
    // This avoids "new version of pre-bundle" race conditions from mid-session discovery.
    // React deps are pre-bundled so the vite-proxy can intercept them for cross-origin loading.
    noDiscovery: true,
    include: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
  },
  build: {
    rollupOptions: {
      // Mark React as external in production builds
      external: REACT_EXTERNALS,
    },
  },
  ssr: {
    external: ["bun"],
    noExternal: ["hono", "@hands/stdlib"],
  },
  server: {
    fs: {
      // Allow serving files from anywhere (for /@fs/ access to stdlib components)
      allow: ["/"],
    },
  },
});
