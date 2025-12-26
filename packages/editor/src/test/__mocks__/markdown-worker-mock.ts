/**
 * Mock Markdown Worker for Tests
 *
 * Provides a no-op worker class so tests can import modules
 * that use the worker without actually creating web workers.
 */

class MockWorker {
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;

  postMessage(_data: unknown) {
    // No-op in tests
  }

  terminate() {
    // No-op in tests
  }

  addEventListener(_type: string, _listener: EventListener) {
    // No-op in tests
  }

  removeEventListener(_type: string, _listener: EventListener) {
    // No-op in tests
  }

  dispatchEvent(_event: Event): boolean {
    return false;
  }
}

export default MockWorker;
