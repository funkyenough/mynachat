// Service worker: gets the Myna Portal session cookies (opening a login tab if
// needed) and hands the proof job to the offscreen document, which runs the
// TLSNotary WASM prover in a worker.

import { ALLOWED_VERIFIERS } from './config.js';
const MYNA = 'https://myna.go.jp';
const API_URL = `${MYNA}/api/my/healthinfo/get-medicine-info`;
const LOGIN_TIMEOUT_MS = 10 * 60 * 1000;

// The service worker may be suspended while the offscreen prover runs, so all
// state needed to answer (the requesting tabId) travels with the messages.
let busy = false;

function toTab(tabId, msg) {
  chrome.tabs.sendMessage(tabId, msg).catch(() => {});
}

function progress(tabId, sessionId, stage) {
  toTab(tabId, { type: 'MYNA_PROVE_PROGRESS', sessionId, stage });
}

function finish(tabId, sessionId, passed, error) {
  toTab(tabId, { type: 'MYNA_PROVE_RESULT', sessionId, passed, ...(error ? { error } : {}) });
  busy = false;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'MYNA_PROVE_REQUEST' && sender.tab) {
    const tabId = sender.tab.id;
    if (busy) {
      toTab(tabId, { type: 'MYNA_PROVE_RESULT', sessionId: msg.sessionId, passed: false, error: 'another proof is already running' });
    } else {
      busy = true;
      runProof(tabId, msg).catch((e) => finish(tabId, msg.sessionId, false, String(e?.message ?? e)));
    }
    sendResponse({ ok: true });
    return;
  }
  // Messages from the offscreen prover.
  if (msg?.target === 'background') {
    if (msg.kind === 'progress') progress(msg.tabId, msg.sessionId, msg.stage);
    if (msg.kind === 'result') finish(msg.tabId, msg.sessionId, msg.passed, msg.error);
    if (msg.kind === 'audit') chrome.storage.session.set({ [`audit:${msg.sessionId}`]: msg.audit });
  }
  // The web app's audit page asks for the prover's view of a session.
  if (msg?.type === 'MYNA_AUDIT_REQUEST' && sender.tab) {
    chrome.storage.session.get(`audit:${msg.sessionId}`).then((r) => {
      sendResponse({ audit: r[`audit:${msg.sessionId}`] ?? null });
    });
    return true; // async sendResponse
  }
});

async function runProof(tabId, { sessionId, groupId, method, verifierUrl, debugNoLogin }) {
  verifierUrl = (verifierUrl || 'ws://localhost:7047').replace(/\/$/, '');
  // The page names the verifier, so only accept a local one or one baked into this build.
  const local = /^ws:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(verifierUrl);
  if (!local && !ALLOWED_VERIFIERS.includes(verifierUrl)) {
    throw new Error(`verifier ${verifierUrl} is not trusted by this extension build`);
  }
  if (method !== 'prescription') throw new Error(`method ${method} is not supported yet`);

  progress(tabId, sessionId, 'checking_login');
  // debugNoLogin: skip login and send no cookie. Myna answers with a real ED1107
  // error JSON, which exercises MPC-TLS against production (result: passed=false).
  const cookieHeader = debugNoLogin ? '' : await ensureLoggedIn(tabId, sessionId);

  progress(tabId, sessionId, 'starting_prover');
  await ensureOffscreen();
  await chrome.runtime.sendMessage({
    target: 'offscreen',
    kind: 'prove',
    job: { tabId, sessionId, groupId, method, verifierUrl: verifierUrl.replace(/\/$/, ''), cookieHeader },
  });
}

async function mynaCookieHeader() {
  const cookies = await chrome.cookies.getAll({ url: API_URL });
  if (!cookies.some((c) => c.name === 'SESSION')) return null;
  return cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}

// Asks Myna Portal whether the session is logged in. Extension fetches to a host
// in host_permissions carry that host's cookies.
async function isLoggedIn() {
  try {
    const res = await fetch(`${MYNA}/api/common/login/is-login`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ commonHeader: { screenId: 'home__________' } }),
    });
    const json = await res.json();
    return json?.resBody?.loginInfo?.isLogin === 'true';
  } catch {
    return false;
  }
}

async function ensureLoggedIn(tabId, sessionId) {
  let header = await mynaCookieHeader();
  if (header && (await isLoggedIn())) return header;

  progress(tabId, sessionId, 'waiting_for_login');
  const tab = await chrome.tabs.create({ url: `${MYNA}/`, active: true });
  const deadline = Date.now() + LOGIN_TIMEOUT_MS;
  // Poll instead of relying on cookies.onChanged alone: each extension API call
  // also keeps this service worker alive while the user logs in.
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2000));
    header = await mynaCookieHeader();
    if (header && (await isLoggedIn())) {
      // Bring the user back to the page that asked; leave the Myna tab open.
      chrome.tabs.update(tabId, { active: true }).catch(() => {});
      return header;
    }
    const still = await chrome.tabs.get(tab.id).catch(() => null);
    if (!still) throw new Error('Myna Portal tab was closed before login completed');
  }
  throw new Error('timed out waiting for Myna Portal login');
}

async function ensureOffscreen() {
  const url = chrome.runtime.getURL('offscreen.html');
  const existing = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [url],
  });
  if (existing.length) return;
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['WORKERS'],
    justification: 'Run the TLSNotary WASM prover (needs web workers)',
  });
  // Wait until the offscreen script has registered its listener.
  for (let i = 0; i < 50; i++) {
    const pong = await chrome.runtime.sendMessage({ target: 'offscreen', kind: 'ping' }).catch(() => null);
    if (pong === 'pong') return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('offscreen document did not start');
}
