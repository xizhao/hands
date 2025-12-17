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
    window.parent.postMessage({
      type: "grab-select",
      blockId,
      tagName: element.tagName,
    }, "*");
  },

  onCopySuccess: (_elements: Element[], content: string) => {
    window.parent.postMessage({
      type: "grab-context",
      content,
      blockId,
    }, "*");
  },

  onStateChange: (state: { isActive: boolean }) => {
    window.parent.postMessage({
      type: "grab-state",
      isActive: state.isActive,
      blockId,
    }, "*");
  },
});

// Expose API for debugging
(window as any).__GRAB_API__ = grabApi;
console.log("[preview-client] react-grab ready, api:", grabApi);

// Listen for messages from parent
window.addEventListener("message", (e) => {
  // Theme sync
  if (e.data?.type === "theme") {
    let style = document.getElementById("theme-vars") as HTMLStyleElement | null;
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
  window.parent.postMessage({
    type: "sandbox-error",
    error: {
      message: String(message),
      source,
      lineno,
      colno,
      stack: error?.stack,
    }
  }, "*");
  return false; // Don't suppress the error
};

window.addEventListener("unhandledrejection", (e) => {
  window.parent.postMessage({
    type: "sandbox-error",
    error: {
      message: e.reason?.message || String(e.reason),
      stack: e.reason?.stack,
    }
  }, "*");
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
