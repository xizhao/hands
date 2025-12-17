/**
 * Preview Client - Iframe messaging for embedded block previews
 *
 * Handles communication between embedded block iframes and parent editor:
 * - Receives theme styles from parent
 * - Reports errors back to parent
 * - Signals when ready
 */

// Listen for styles from parent
window.addEventListener("message", (e) => {
  if (e.data?.type === "styles") {
    let style = document.getElementById("parent-styles") as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement("style");
      style.id = "parent-styles";
      document.head.appendChild(style);
    }
    style.textContent = e.data.css;

    // Toggle dark class based on parent's theme
    if (e.data.isDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
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
