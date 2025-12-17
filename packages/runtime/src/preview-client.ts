/**
 * Preview Client - Iframe messaging for embedded block previews
 *
 * Handles communication between embedded block iframes and parent editor:
 * - Receives theme styles from parent
 * - Reports errors back to parent
 * - Signals when ready
 * - React-grab for element selection context capture
 */

import { init as initGrab } from "react-grab/core";
import { initClient } from "rwsdk/client";

initClient({
  hydrateRootOptions: {
    onRecoverableError: (
      error: unknown,
      errorInfo: { componentStack?: string }
    ) => {
      console.warn("[client] Recoverable error:", error);
      if (error instanceof Error) {
        window.parent.postMessage(
          {
            type: "sandbox-error",
            error: {
              message: String(error.message),
              name: error.name,
              stack: error.stack,
            },
          },
          "*"
        );
      }
    },
    onUncaughtError: (
      error: unknown,
      errorInfo: { componentStack?: string }
    ) => {
      console.error("[client] Uncaught render error:", error);
      if (error instanceof Error) {
        window.parent.postMessage(
          {
            type: "sandbox-error",
            error: {
              message: String(error.message),
              name: error.name,
              stack: error.stack,
            },
          },
          "*"
        );
      }
    },
  },
});

// Extract block ID from URL path: /preview/:blockId
const blockId = window.location.pathname.split("/preview/")[1] || "";

// Initialize react-grab with callbacks and postMessage
const grabApi = initGrab({
  theme: {
    enabled: true,
    crosshair: { enabled: true },
    elementLabel: { enabled: true },
  },

  onElementSelect: (element: Element) => {
    window.parent.postMessage(
      {
        type: "grab-select",
        blockId,
        tagName: element.tagName,
      },
      "*"
    );
  },

  onCopySuccess: (_elements: Element[], content: string) => {
    window.parent.postMessage(
      {
        type: "grab-context",
        content,
        blockId,
      },
      "*"
    );
  },

  onStateChange: (state: { isActive: boolean }) => {
    window.parent.postMessage(
      {
        type: "grab-state",
        isActive: state.isActive,
        blockId,
      },
      "*"
    );
  },
});

// Expose API for debugging
(window as any).__GRAB_API__ = grabApi;
console.log("[preview-client] react-grab ready, api:", grabApi);

// Listen for messages from parent
window.addEventListener("message", (e) => {
  // Theme sync
  if (e.data?.type === "theme") {
    let style = document.getElementById(
      "theme-vars"
    ) as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement("style");
      style.id = "theme-vars";
      document.head.appendChild(style);
    }
    style.textContent = e.data.css;

    // Sync dark mode class
    if (e.data.isDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }

  // React-grab control from parent
  if (e.data?.type === "grab-activate") {
    grabApi.activate();
  } else if (e.data?.type === "grab-deactivate") {
    grabApi.deactivate();
  } else if (e.data?.type === "grab-toggle") {
    grabApi.toggle();
  }
});

// Capture and report errors to parent
window.onerror = (message, source, lineno, colno, error) => {
  // Determine if this looks like a React render error
  const isRenderError =
    error?.stack?.includes("renderWithHooks") ||
    error?.stack?.includes("mountIndeterminateComponent") ||
    error?.stack?.includes("beginWork") ||
    error?.message?.includes("Cannot read properties of") ||
    error?.message?.includes("is not a function");

  window.parent.postMessage(
    {
      type: "sandbox-error",
      error: {
        message: String(message),
        name: error?.name,
        source:
          typeof source === "string"
            ? source.replace(/^.*\/blocks\//, "blocks/")
            : undefined,
        line: lineno,
        column: colno,
        stack: error?.stack,
        blockId,
        isRenderError,
      },
    },
    "*"
  );
  return false; // Don't suppress the error
};

window.addEventListener("unhandledrejection", (e) => {
  const isRenderError =
    e.reason?.stack?.includes("renderWithHooks") ||
    e.reason?.stack?.includes("mountIndeterminateComponent");

  window.parent.postMessage(
    {
      type: "sandbox-error",
      error: {
        message: e.reason?.message || String(e.reason),
        name: e.reason?.name,
        stack: e.reason?.stack,
        blockId,
        isRenderError,
      },
    },
    "*"
  );
});

// Measure and report content height
function reportHeight() {
  const root = document.getElementById("root");
  if (!root) return;

  // Use getBoundingClientRect for accurate rendered height
  const rect = root.getBoundingClientRect();
  const height = Math.ceil(rect.height);
  window.parent.postMessage({ type: "sandbox-resize", height }, "*");
}

// Watch for content size changes
const resizeObserver = new ResizeObserver(() => {
  reportHeight();
});

// Start observing once DOM is ready
function init() {
  const root = document.getElementById("root");
  if (root) {
    resizeObserver.observe(root);
    reportHeight();
  }

  // Signal ready to parent with initial height
  const rect = root?.getBoundingClientRect();
  const height = rect ? Math.ceil(rect.height) : 100;
  window.parent.postMessage({ type: "sandbox-ready", height }, "*");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
