// Dedicated worker hosting the TLSNotary WASM prover (tlsn-wasm 0.1.0-alpha.15,
// which must match the verifier's tlsn git tag).
//
// Flow: MPC setup with the verifier (/prove) -> MPC-TLS to myna.go.jp through the
// verifier's WebSocket->TCP relay (/relay) -> reveal only the request line and one
// matching `"drugN":"..."` pair -> read the verifier's verdict (/result).

import initWasm, { initialize, Prover } from './tlsn/tlsn_wasm.js';
import { findMatchingDrug, indexOfSeq, stemsForGroup } from './match.js';

const SERVER_NAME = 'myna.go.jp';
const PATH = '/api/my/healthinfo/get-medicine-info';
const BODY = '{"commonHeader":{"screenId":"medicine_past_"}}';
const MAX_SENT_DATA = 4096;
const MAX_RECV_DATA = 32768;

let ready = null;
function ensureWasm() {
  ready ??= (async () => {
    await initWasm();
    await initialize(
      { level: 'Info', crate_filters: [{ name: 'yamux', level: 'Warn' }], span_events: undefined },
      Math.max(2, navigator.hardwareConcurrency || 4),
    );
  })();
  return ready;
}

/** IoChannel (read/write/close) over a binary WebSocket, as tlsn-wasm expects. */
function openChannel(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';
    const queue = [];
    let waiter = null;
    let closed = false;
    const push = (v) => {
      if (waiter) { const w = waiter; waiter = null; w(v); } else queue.push(v);
    };
    ws.onmessage = (e) => push(new Uint8Array(e.data));
    ws.onclose = () => { closed = true; push(null); };
    ws.onerror = () => { if (ws.readyState !== WebSocket.OPEN) reject(new Error(`cannot connect to ${url}`)); };
    ws.onopen = () => resolve({
      async read() {
        if (queue.length) return queue.shift();
        if (closed) return null;
        return new Promise((r) => { waiter = r; });
      },
      async write(data) {
        if (ws.readyState !== WebSocket.OPEN) throw new Error('websocket closed');
        ws.send(data.slice()); // copy out of (shared) WASM memory
      },
      async close() { ws.close(); },
    });
  });
}

function waitResult(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.onmessage = (e) => { resolve(JSON.parse(e.data)); ws.close(); };
    ws.onerror = () => reject(new Error('could not read verifier result'));
  });
}

const enc = new TextEncoder();

function toB64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function cookieNames(cookieHeader) {
  return (cookieHeader || '').split(';').map((c) => c.split('=')[0].trim()).filter(Boolean);
}

/** Copy of the request bytes with every cookie value overwritten by '*' (same length, so ranges still line up). */
function redactCookie(bytes) {
  const out = Uint8Array.from(bytes);
  const text = new TextDecoder('latin1').decode(out);
  const m = /\r\ncookie: ([^\r]*)/i.exec(text);
  if (!m) return out;
  const start = m.index + m[0].length - m[1].length;
  let i = start;
  for (const part of m[1].split(';')) {
    const eq = part.indexOf('=');
    const valueStart = i + (eq >= 0 ? eq + 1 : part.length);
    for (let k = valueStart; k < i + part.length; k++) out[k] = 0x2a;
    i += part.length + 1;
  }
  return out;
}
const header = (v) => Array.from(enc.encode(v));

async function prove(job) {
  const { tabId, sessionId, groupId, method, verifierUrl, cookieHeader } = job;
  const timeline = [];
  const stage = (s) => {
    const tMs = Math.round(performance.now() - t0);
    timeline.push({ tMs, stage: s });
    console.log(`[prover] ${s} (+${(tMs / 1000).toFixed(1)}s)`);
    self.postMessage({ kind: 'progress', tabId, sessionId, stage: s });
  };
  const t0 = performance.now();
  const startedAt = new Date().toISOString();

  stage('loading_wasm');
  await ensureWasm();

  const prover = new Prover({
    server_name: SERVER_NAME,
    mode: 'Mpc',
    max_sent_data: MAX_SENT_DATA,
    max_sent_records: undefined,
    max_recv_data_online: undefined,
    max_recv_data: MAX_RECV_DATA,
    max_recv_records_online: undefined,
    defer_decryption_from_start: undefined,
    network: 'Bandwidth',
    client_auth: undefined,
    root_certs: undefined,
  });
  try {
    stage('mpc_setup');
    const q = new URLSearchParams({ sessionId, groupId, method });
    await prover.setup(await openChannel(`${verifierUrl}/prove?${q}`));

    stage('requesting');
    const relay = await openChannel(`${verifierUrl}/relay?target=${SERVER_NAME}:443`);
    const response = await prover.send_request(relay, {
      uri: PATH,
      method: 'POST',
      headers: new Map([
        ['host', header(SERVER_NAME)],
        ['user-agent', header(navigator.userAgent)],
        ['accept', header('application/json, text/plain, */*')],
        ['accept-encoding', header('identity')],
        ['content-type', header('application/json')],
        ['origin', header('https://myna.go.jp')],
        ['referer', header('https://myna.go.jp/')],
        ['connection', header('close')],
        ...(cookieHeader ? [['cookie', header(cookieHeader)]] : []),
      ]),
      body: BODY, // a string body is sent verbatim
    });
    stage(`response_${response.status}`);

    const { sent, recv } = prover.transcript();
    const sentBytes = Uint8Array.from(sent);
    const recvBytes = Uint8Array.from(recv);
    const { drugCount, match } = findMatchingDrug(recvBytes, await stemsForGroup(groupId));
    console.log(`[prover] transcript sent=${sent.length} recv=${recv.length} drugN=${drugCount} match=${!!match}`);

    // Reveal the request line only (cookie and other headers stay hidden) and,
    // if found, one matching drugN pair. With no match we still finish the
    // protocol so the verifier records a failed attempt.
    stage('revealing');
    const reveal = {
      sent: [{ start: 0, end: indexOfSeq(sentBytes, [13, 10]) }],
      recv: match ? [{ start: match.start, end: match.end }] : [],
      server_identity: true,
    };
    await prover.reveal(reveal, null);

    stage('verifying');
    const q2 = new URLSearchParams({ sessionId });
    const outcome = await waitResult(`${verifierUrl}/result?${q2}`);
    stage('done');
    const error = outcome.error ?? (match ? undefined : `no matching prescription found (${drugCount} drugs checked)`);
    // The prover's own view, kept inside the extension (chrome.storage.session) for the
    // audit report. Never sent to the verifier or the web server.
    self.postMessage({
      kind: 'audit',
      sessionId,
      audit: {
        sessionId, groupId, method, startedAt, serverName: SERVER_NAME,
        limits: { maxSent: MAX_SENT_DATA, maxRecv: MAX_RECV_DATA },
        request: { method: 'POST', path: PATH, body: BODY, cookieNames: cookieNames(cookieHeader) },
        responseStatus: response.status,
        sentB64: toB64(redactCookie(sentBytes)),
        recvB64: toB64(recvBytes),
        revealed: { sent: reveal.sent.map((r) => [r.start, r.end]), recv: reveal.recv.map((r) => [r.start, r.end]) },
        drugCount,
        matched: match ? { value: match.value, stem: match.stem ?? null } : null,
        timeline,
        verifierOutcome: outcome,
      },
    });
    self.postMessage({ kind: 'result', tabId, sessionId, passed: !!outcome.passed, error });
  } finally {
    prover.free();
  }
}

self.onmessage = (event) => {
  const job = event.data;
  prove(job).catch((e) => {
    console.error('[prover] failed', e);
    self.postMessage({
      kind: 'result',
      tabId: job.tabId,
      sessionId: job.sessionId,
      passed: false,
      error: String(e?.message ?? e),
    });
  });
};
