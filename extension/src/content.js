// Bridge between the web app (window.postMessage) and the extension service worker.
// Runs on http://localhost:3000/* and any hosted origin added at build time (build.mjs).

window.addEventListener('message', (event) => {
  if (event.source !== window || event.origin !== window.location.origin) return;
  const msg = event.data;
  if (msg?.type === 'MYNA_AUDIT_REQUEST') {
    chrome.runtime.sendMessage({ type: 'MYNA_AUDIT_REQUEST', sessionId: msg.sessionId })
      .then((r) => window.postMessage({ type: 'MYNA_AUDIT_RESULT', sessionId: msg.sessionId, audit: r?.audit ?? null }, window.location.origin))
      .catch(() => window.postMessage({ type: 'MYNA_AUDIT_RESULT', sessionId: msg.sessionId, audit: null }, window.location.origin));
    return;
  }
  if (!msg || msg.type !== 'MYNA_PROVE_REQUEST') return;
  const { sessionId, groupId, method, verifierUrl, debugNoLogin } = msg;
  chrome.runtime.sendMessage({ type: 'MYNA_PROVE_REQUEST', sessionId, groupId, method, verifierUrl, debugNoLogin })
    .catch((e) => {
      window.postMessage(
        { type: 'MYNA_PROVE_RESULT', sessionId, passed: false, error: `extension unavailable: ${e.message}` },
        window.location.origin,
      );
    });
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg && (msg.type === 'MYNA_PROVE_PROGRESS' || msg.type === 'MYNA_PROVE_RESULT')) {
    window.postMessage(msg, window.location.origin);
  }
});

// Lets the page detect that the extension is installed.
window.postMessage({ type: 'MYNA_EXTENSION_READY' }, window.location.origin);
