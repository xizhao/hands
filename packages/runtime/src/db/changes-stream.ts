/**
 * Database Changes SSE Stream
 *
 * Testable module for streaming database changes via Server-Sent Events.
 * Separates the SSE transport from the PostgreSQL listener.
 */

import type { DatabaseChange } from "./listener";

export interface ChangeStreamEvent {
  type: "change";
  change: DatabaseChange;
}

export interface HistoryEvent {
  type: "history";
  changes: DatabaseChange[];
}

export type StreamEvent = ChangeStreamEvent | HistoryEvent;

/**
 * Interface for change sources (PostgresListener implements this)
 */
export interface ChangeSource {
  getRecentChanges(): DatabaseChange[];
  subscribe(listener: (change: DatabaseChange) => void): () => void;
}

/**
 * Create an SSE stream for database changes
 *
 * @param source - Change source (e.g., PostgresListener)
 * @param signal - AbortSignal for cleanup on disconnect
 * @returns ReadableStream for SSE response
 */
export function createChangesStream(
  source: ChangeSource,
  signal?: AbortSignal
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  let isClosed = false;

  return new ReadableStream({
    start(controller) {
      // Always send history event first (even if empty) to flush the connection
      const recent = source.getRecentChanges();
      const historyEvent: HistoryEvent = { type: "history", changes: recent };
      const data = `data: ${JSON.stringify(historyEvent)}\n\n`;
      controller.enqueue(encoder.encode(data));

      // Subscribe to new changes
      unsubscribe = source.subscribe((change) => {
        if (isClosed) return;
        try {
          const changeEvent: ChangeStreamEvent = { type: "change", change };
          const data = `data: ${JSON.stringify(changeEvent)}\n\n`;
          controller.enqueue(encoder.encode(data));
        } catch (err) {
          console.error("[changes-stream] Error enqueueing change:", err);
        }
      });

      // Send heartbeat every 15 seconds to keep connection alive
      heartbeatInterval = setInterval(() => {
        if (isClosed) return;
        try {
          // SSE comment line (starts with :) - keeps connection alive without triggering onmessage
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          // Controller closed, cleanup will happen via abort
        }
      }, 15000);

      // Cleanup on abort/disconnect
      const cleanup = () => {
        isClosed = true;
        unsubscribe?.();
        if (heartbeatInterval) {
          clearInterval(heartbeatInterval);
          heartbeatInterval = null;
        }
        try {
          controller.close();
        } catch {
          // Already closed
        }
      };

      signal?.addEventListener("abort", cleanup);
    },

    cancel() {
      isClosed = true;
      unsubscribe?.();
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
      }
    },
  });
}

/**
 * Create SSE Response with proper headers
 */
export function createSSEResponse(stream: ReadableStream<Uint8Array>): Response {
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

/**
 * Mock change source for testing
 */
export class MockChangeSource implements ChangeSource {
  private listeners = new Set<(change: DatabaseChange) => void>();
  private history: DatabaseChange[] = [];

  getRecentChanges(): DatabaseChange[] {
    return [...this.history];
  }

  subscribe(listener: (change: DatabaseChange) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Add a change to history (for test setup) */
  addToHistory(change: DatabaseChange): void {
    this.history.push(change);
  }

  /** Emit a change to all subscribers (simulates pg_notify) */
  emit(change: DatabaseChange): void {
    this.listeners.forEach((listener) => listener(change));
  }

  /** Clear history */
  clearHistory(): void {
    this.history = [];
  }

  /** Get subscriber count (for test assertions) */
  get subscriberCount(): number {
    return this.listeners.size;
  }
}

/**
 * Parse SSE data from stream chunks
 * Useful for testing - collects events from stream
 */
export async function collectSSEEvents(
  stream: ReadableStream<Uint8Array>,
  maxEvents = 10,
  timeoutMs = 5000
): Promise<StreamEvent[]> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const events: StreamEvent[] = [];
  let buffer = "";

  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("Timeout collecting SSE events")), timeoutMs);
  });

  try {
    while (events.length < maxEvents) {
      const readPromise = reader.read();
      const { done, value } = await Promise.race([readPromise, timeout]);

      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Parse complete SSE messages
      const lines = buffer.split("\n\n");
      buffer = lines.pop() || ""; // Keep incomplete message in buffer

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const json = line.slice(6);
          try {
            events.push(JSON.parse(json));
          } catch {
            // Skip malformed JSON
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return events;
}
