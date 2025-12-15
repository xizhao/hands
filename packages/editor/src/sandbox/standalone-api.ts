/**
 * Standalone mode API client
 *
 * Uses local vite dev server endpoints instead of tRPC/runtime
 */

export interface SourceResult {
  id: string;
  type: "block" | "page";
  source: string;
}

const API_BASE = ""; // Same origin as sandbox

export async function getSource(
  type: "block" | "page",
  id: string
): Promise<SourceResult> {
  const res = await fetch(`${API_BASE}/api/source/${type}/${id}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Failed to get ${type} source`);
  }
  return res.json();
}

export async function saveSource(
  type: "block" | "page",
  id: string,
  source: string
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/source/${type}/${id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Failed to save ${type} source`);
  }
}

/**
 * Hook for polling source changes (simplified version of usePageSource)
 */
export function createSourcePoller(
  type: "block" | "page",
  id: string,
  onSourceChange: (source: string) => void,
  interval = 1000
) {
  let lastSource: string | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;

  async function poll() {
    try {
      const result = await getSource(type, id);
      if (result.source !== lastSource) {
        lastSource = result.source;
        onSourceChange(result.source);
      }
    } catch (err) {
      console.error("[poller] Error:", err);
    }
  }

  function start() {
    poll(); // Initial fetch
    timer = setInterval(poll, interval);
  }

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  return { start, stop };
}
