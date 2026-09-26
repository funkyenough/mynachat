// Offscreen document: owns the prover worker (WASM needs workers + SharedArrayBuffer,
// which the service worker cannot provide) and relays messages to the background.

const worker = new Worker(new URL('./prover-worker.js', import.meta.url), { type: 'module' });

worker.onmessage = (event) => {
  chrome.runtime.sendMessage({ target: 'background', ...event.data }).catch(() => {});
};
worker.onerror = (event) => console.error('[offscreen] prover worker error', event.message);

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.target !== 'offscreen') return;
  if (msg.kind === 'ping') sendResponse('pong');
  if (msg.kind === 'prove') {
    console.log('[offscreen] crossOriginIsolated =', self.crossOriginIsolated);
    worker.postMessage(msg.job);
    sendResponse('started');
  }
});
