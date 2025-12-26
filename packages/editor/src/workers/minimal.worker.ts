// Minimal worker - no imports at all
console.log('[MinimalWorker] Script loaded');
self.postMessage({ type: 'minimal_started' });

self.onmessage = (e) => {
  console.log('[MinimalWorker] Received:', e.data);
  self.postMessage({ type: 'echo', data: e.data });
};
