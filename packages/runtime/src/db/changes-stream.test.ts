/**
 * Tests for Database Changes SSE Stream
 *
 * Run with: bun test src/db/changes-stream.test.ts
 */

import { describe, it, expect, beforeEach } from "bun:test";
import {
  createChangesStream,
  createSSEResponse,
  MockChangeSource,
  collectSSEEvents,
  type StreamEvent,
} from "./changes-stream";
import type { DatabaseChange } from "./listener";

describe("MockChangeSource", () => {
  let source: MockChangeSource;

  beforeEach(() => {
    source = new MockChangeSource();
  });

  it("returns empty history initially", () => {
    expect(source.getRecentChanges()).toEqual([]);
  });

  it("tracks history when changes are added", () => {
    const change: DatabaseChange = {
      table: "users",
      op: "INSERT",
      rowId: "1",
      ts: Date.now(),
    };
    source.addToHistory(change);
    expect(source.getRecentChanges()).toEqual([change]);
  });

  it("notifies subscribers when emitting", () => {
    const received: DatabaseChange[] = [];
    source.subscribe((change) => received.push(change));

    const change: DatabaseChange = {
      table: "users",
      op: "UPDATE",
      rowId: "1",
      ts: Date.now(),
    };
    source.emit(change);

    expect(received).toEqual([change]);
  });

  it("allows unsubscribing", () => {
    const received: DatabaseChange[] = [];
    const unsubscribe = source.subscribe((change) => received.push(change));

    expect(source.subscriberCount).toBe(1);
    unsubscribe();
    expect(source.subscriberCount).toBe(0);

    source.emit({
      table: "users",
      op: "DELETE",
      rowId: "1",
      ts: Date.now(),
    });

    expect(received).toEqual([]);
  });
});

describe("createChangesStream", () => {
  let source: MockChangeSource;

  beforeEach(() => {
    source = new MockChangeSource();
  });

  it("sends history on connect", async () => {
    const change: DatabaseChange = {
      table: "users",
      op: "INSERT",
      rowId: "1",
      ts: 1234567890,
    };
    source.addToHistory(change);

    const stream = createChangesStream(source);
    const events = await collectSSEEvents(stream, 1, 100);

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("history");
    expect((events[0] as { type: "history"; changes: DatabaseChange[] }).changes).toEqual([change]);
  });

  it("streams live changes", async () => {
    const stream = createChangesStream(source);

    // Start collecting in background
    const eventsPromise = collectSSEEvents(stream, 2, 1000);

    // Emit changes after a small delay
    await new Promise((r) => setTimeout(r, 10));

    const change1: DatabaseChange = {
      table: "posts",
      op: "INSERT",
      rowId: "10",
      ts: Date.now(),
    };
    const change2: DatabaseChange = {
      table: "posts",
      op: "UPDATE",
      rowId: "10",
      ts: Date.now(),
    };

    source.emit(change1);
    source.emit(change2);

    const events = await eventsPromise;

    expect(events).toHaveLength(2);
    expect(events[0].type).toBe("change");
    expect(events[1].type).toBe("change");
    expect((events[0] as { type: "change"; change: DatabaseChange }).change.table).toBe("posts");
  });

  it("includes history before live changes", async () => {
    // Add history
    source.addToHistory({
      table: "old",
      op: "INSERT",
      rowId: "0",
      ts: 1000,
    });

    const stream = createChangesStream(source);
    const eventsPromise = collectSSEEvents(stream, 2, 1000);

    await new Promise((r) => setTimeout(r, 10));

    source.emit({
      table: "new",
      op: "INSERT",
      rowId: "1",
      ts: 2000,
    });

    const events = await eventsPromise;

    expect(events).toHaveLength(2);
    expect(events[0].type).toBe("history");
    expect(events[1].type).toBe("change");
  });

  it("cleans up subscriber on abort", async () => {
    const controller = new AbortController();
    const stream = createChangesStream(source, controller.signal);

    // Start reading to trigger subscription
    const reader = stream.getReader();
    await new Promise((r) => setTimeout(r, 10));

    expect(source.subscriberCount).toBe(1);

    // Abort
    controller.abort();
    await new Promise((r) => setTimeout(r, 10));

    expect(source.subscriberCount).toBe(0);

    reader.releaseLock();
  });
});

describe("createSSEResponse", () => {
  it("returns Response with correct headers", () => {
    const stream = new ReadableStream();
    const response = createSSEResponse(stream);

    expect(response.headers.get("Content-Type")).toBe("text/event-stream");
    expect(response.headers.get("Cache-Control")).toBe("no-cache");
    expect(response.headers.get("Connection")).toBe("keep-alive");
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});

describe("collectSSEEvents", () => {
  it("parses SSE data format correctly", async () => {
    const encoder = new TextEncoder();
    const events: StreamEvent[] = [
      { type: "history", changes: [] },
      { type: "change", change: { table: "t", op: "INSERT", rowId: "1", ts: 0 } },
    ];

    const stream = new ReadableStream({
      start(controller) {
        for (const event of events) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        }
        controller.close();
      },
    });

    const collected = await collectSSEEvents(stream, 10, 1000);
    expect(collected).toEqual(events);
  });

  it("handles chunked data", async () => {
    const encoder = new TextEncoder();
    const event: StreamEvent = { type: "history", changes: [] };
    const sseMessage = `data: ${JSON.stringify(event)}\n\n`;

    // Split message across chunks
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(sseMessage.slice(0, 10)));
        controller.enqueue(encoder.encode(sseMessage.slice(10)));
        controller.close();
      },
    });

    const collected = await collectSSEEvents(stream, 1, 1000);
    expect(collected).toEqual([event]);
  });
});
