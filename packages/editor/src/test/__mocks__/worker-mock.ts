/**
 * Mock worker constructor for tests.
 * The actual worker functionality is tested via the replicated logic in markdown-worker.test.ts
 */
export default class MockWorker {
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  onmessageerror: ((e: MessageEvent) => void) | null = null;

  postMessage(_data: unknown) {
    // Mock: do nothing in tests
  }

  terminate() {
    // Mock: do nothing
  }
}
