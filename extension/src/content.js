// Bridge between the web app (window.postMessage) and the extension service worker.
// Runs on http://localhost:3000/* only.

window.addEventListener('message', (event) => {
  if (event.source !== window || event.origin !== window.location.origin) return;
  const msg = event.data;
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
