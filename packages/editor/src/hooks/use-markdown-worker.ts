/**
 * useMarkdownWorker - Hook for offloading markdown serialization to a web worker
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { TElement } from "platejs";

// Use Vite's worker bundling - creates a real worker file, not a blob URL
import MarkdownWorker from "../workers/markdown.worker?worker";

// ============================================================================
// Content Hash Cache (exported for Editor-level caching)
// ============================================================================

// Simple string hash function (FNV-1a)
function hashString(str: string): string {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

interface CacheEntry {
  nodes: TElement[];
  timestamp: number;
}

// LRU cache for deserialized content
const deserializeCache = new Map<string, CacheEntry>();
const CACHE_MAX_SIZE = 50;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get cached deserialized nodes for markdown content.
 * Call this BEFORE invoking the worker to skip the entire async roundtrip.
 */
export function getDeserializeCache(markdown: string): TElement[] | null {
  const hash = hashString(markdown);
  const entry = deserializeCache.get(hash);
  if (entry && Date.now() - entry.timestamp < CACHE_TTL) {
    return entry.nodes;
  }
  if (entry) {
    deserializeCache.delete(hash); // Expired
  }
  return null;
}

/**
 * Cache deserialized nodes for markdown content.
 */
export function setDeserializeCache(markdown: string, nodes: TElement[]): void {
  const hash = hashString(markdown);
  // LRU eviction
  if (deserializeCache.size >= CACHE_MAX_SIZE) {
    const oldest = deserializeCache.keys().next().value;
    if (oldest) deserializeCache.delete(oldest);
  }
  deserializeCache.set(hash, { nodes, timestamp: Date.now() });
}

// ============================================================================
// Types
// ============================================================================

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

interface UseMarkdownWorkerResult {
  serialize: (value: TElement[]) => Promise<string>;
  deserialize: (markdown: string) => Promise<TElement[]>;
  isReady: boolean;
}

type WorkerRequest =
  | { id: number; type: "serialize"; value: unknown[] }
  | { id: number; type: "deserialize"; markdown: string };

type WorkerResponse =
  | { id: number; type: "serialize"; result: string }
  | { id: number; type: "deserialize"; result: unknown[] }
  | { id: number; type: "error"; error: string };

// ============================================================================
// Singleton Worker
// ============================================================================

let sharedWorker: Worker | null = null;
let sharedWorkerReady = false;
let requestId = 0;
const pendingRequests = new Map<number, PendingRequest>();
const readyCallbacks: (() => void)[] = [];

function getOrCreateWorker(): Worker {
  if (!sharedWorker) {
    const worker = new MarkdownWorker();

    worker.onmessage = (event: MessageEvent) => {
      const data = event.data;

      if (data.type === "ready") {
        sharedWorkerReady = true;
        readyCallbacks.forEach((cb) => cb());
        readyCallbacks.length = 0;
        return;
      }

      if (data.type === "init_error") {
        console.error("[MarkdownWorker] Init error:", data.error);
        return;
      }

      // Handle responses
      const response = data as WorkerResponse;
      const pending = pendingRequests.get(response.id);
      if (!pending) return;

      pendingRequests.delete(response.id);

      if (response.type === "error") {
        pending.reject(new Error(response.error));
      } else if (response.type === "serialize") {
        pending.resolve(response.result);
      } else if (response.type === "deserialize") {
        pending.resolve(response.result);
      }
    };

    worker.onerror = (error) => {
      console.error("[MarkdownWorker] Error:", error);
      for (const [id, pending] of pendingRequests) {
        pending.reject(new Error("Worker error"));
        pendingRequests.delete(id);
      }
    };

    sharedWorker = worker;
  }
  return sharedWorker;
}

function waitForReady(): Promise<void> {
  if (sharedWorkerReady) return Promise.resolve();
  return new Promise((resolve) => {
    readyCallbacks.push(resolve);
  });
}

// ============================================================================
// Hook
// ============================================================================

export function useMarkdownWorker(): UseMarkdownWorkerResult {
  const workerRef = useRef<Worker | null>(null);
  const [isReady, setIsReady] = useState(sharedWorkerReady);

  if (workerRef.current === null && typeof window !== "undefined") {
    workerRef.current = getOrCreateWorker();
    if (!sharedWorkerReady) {
      waitForReady().then(() => setIsReady(true));
    }
  }

  const serialize = useCallback(async (value: TElement[]): Promise<string> => {
    await waitForReady();
    const id = ++requestId;
    return new Promise((resolve, reject) => {
      pendingRequests.set(id, { resolve: resolve as (v: unknown) => void, reject });
      sharedWorker!.postMessage({ id, type: "serialize", value });
    });
  }, []);

  const deserialize = useCallback(async (markdown: string): Promise<TElement[]> => {
    await waitForReady();
    const id = ++requestId;
    return new Promise((resolve, reject) => {
      pendingRequests.set(id, { resolve: resolve as (v: unknown) => void, reject });
      sharedWorker!.postMessage({ id, type: "deserialize", markdown });
    });
  }, []);

  return { serialize, deserialize, isReady };
}

// ============================================================================
// Debounced Hook
// ============================================================================

interface UseMarkdownWorkerDebouncedOptions {
  delay?: number;
  onSerialize?: (markdown: string) => void;
  onError?: (error: Error) => void;
}

interface UseMarkdownWorkerDebouncedResult {
  queueSerialize: (value: TElement[]) => void;
  serializeNow: (value: TElement[]) => Promise<string>;
  cancel: () => void;
  deserialize: (markdown: string) => Promise<TElement[]>;
}

export function useMarkdownWorkerDebounced(
  options: UseMarkdownWorkerDebouncedOptions = {}
): UseMarkdownWorkerDebouncedResult {
  const { delay = 150, onSerialize, onError } = options;
  const { serialize, deserialize } = useMarkdownWorker();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestValueRef = useRef<TElement[] | null>(null);

  const cancel = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const queueSerialize = useCallback(
    (value: TElement[]) => {
      latestValueRef.current = value;
      cancel();
      timeoutRef.current = setTimeout(async () => {
        const v = latestValueRef.current;
        if (!v) return;
        try {
          const md = await serialize(v);
          onSerialize?.(md);
        } catch (e) {
          onError?.(e instanceof Error ? e : new Error(String(e)));
        }
      }, delay);
    },
    [serialize, delay, onSerialize, onError, cancel]
  );

  const serializeNow = useCallback(
    async (value: TElement[]): Promise<string> => {
      cancel();
      return serialize(value);
    },
    [serialize, cancel]
  );

  useEffect(() => () => cancel(), [cancel]);

  return { queueSerialize, serializeNow, cancel, deserialize };
}
