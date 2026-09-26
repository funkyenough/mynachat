"use client";

import { useEffect, useMemo, useRef, useState } from "react";

// One proof, seen from every side: the prover (extension, full plaintext), the
// verifier (partial transcript + what crossed its relay), and the web app.
// The prover's view comes from the extension over postMessage and stays in this tab.

type Range = [number, number];
type ProverAudit = {
  sessionId: string;
  groupId: string;
  method: string;
  startedAt: string;
  serverName: string;
  limits: { maxSent: number; maxRecv: number };
  request: { method: string; path: string; body: string; cookieNames: string[] };
  responseStatus: number;
  sentB64: string;
  recvB64: string;
  revealed: { sent: Range[]; recv: Range[] };
  drugCount: number;
  matched: { value: string } | null;
  timeline: { tMs: number; stage: string }[];
  verifierOutcome: Record<string, unknown>;
};
type Cert = { subject: string; issuer: string; notBefore: string; notAfter: string; sha256: string; derLen: number };
type Records = {
  count: number;
  ciphertextBytes: number;
  withPlaintext: number;
  types: string[];
  firstCiphertextHex: string | null;
};
type VerifierAudit = {
  sessionId: string;
  groupId: string;
  method: string;
  startedAt: string;
  limits: Record<string, unknown>;
  timeline: { tMs: number; event: string }[];
  tls: {
    serverName: string | null;
    version: string | null;
    connectionTimeUnix: number | null;
    certChainCheck: string;
    sentRecords: Records;
    recvRecords: Records;
  };
  wire: {
    capturedBytes: number;
    recordTypes: string[];
    serverHelloVersion: string | null;
    cipherSuite: string | null;
    certChain: Cert[];
  } | null;
  transcript: {
    sentLen: number;
    recvLen: number;
    sentAuthed: Range[];
    recvAuthed: Range[];
    sentB64: string;
    recvB64: string;
  } | null;
  disclosed: { requestPath: string; fields: [string, string][] } | null;
  criteria: { groupCriteria: unknown; expectedPath: string | null; input: unknown } | null;
  outcome: { passed: boolean; evidence: unknown; error?: string } | null;
  report: string | null;
  error: string | null;
};
type ServerData = { session: Record<string, unknown> | null; verifier: VerifierAudit | null };

const b64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const utf8 = new TextDecoder();
const inRanges = (i: number, rs: Range[]) => rs.some(([a, b]) => i >= a && i < b);

/** Splits bytes into revealed / hidden runs. */
function segments(bytes: Uint8Array, revealed: Range[]) {
  const out: { revealed: boolean; start: number; end: number }[] = [];
  let i = 0;
  while (i < bytes.length) {
    const r = inRanges(i, revealed);
    let j = i + 1;
    while (j < bytes.length && inRanges(j, revealed) === r) j++;
    out.push({ revealed: r, start: i, end: j });
    i = j;
  }
  return out;
}

function Transcript({ bytes, revealed, mode }: { bytes: Uint8Array; revealed: Range[]; mode: "prover" | "verifier" }) {
  return (
    <pre className="tx">
      {segments(bytes, revealed).map((s, k) =>
        s.revealed ? (
          <mark key={k} title={`bytes ${s.start}–${s.end}`}>
            {utf8.decode(bytes.subarray(s.start, s.end))}
          </mark>
        ) : mode === "prover" ? (
          <span key={k}>{utf8.decode(bytes.subarray(s.start, s.end))}</span>
        ) : (
          <span key={k} className="hidden-run" title={`bytes ${s.start}–${s.end}`}>
            ░ {s.end - s.start} bytes hidden (zero in the verifier's copy) ░
          </span>
        ),
      )}
    </pre>
  );
}

function Check({ ok, children }: { ok: boolean | null; children: React.ReactNode }) {
  return (
    <li className={ok === null ? "na" : ok ? "ok" : "bad"}>
      <span className="mark">{ok === null ? "–" : ok ? "✓" : "✗"}</span> {children}
    </li>
  );
}

const Json = ({ v }: { v: unknown }) => <pre className="json">{JSON.stringify(v, null, 2)}</pre>;

export default function AuditReport({ sessionId }: { sessionId: string }) {
  const [server, setServer] = useState<ServerData | null>(null);
  const [serverErr, setServerErr] = useState<string | null>(null);
  const [prover, setProver] = useState<ProverAudit | null | "missing">(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`/api/audit/${encodeURIComponent(sessionId)}`)
      .then(async (r) => (r.ok ? setServer(await r.json()) : setServerErr(`${r.status} ${(await r.json()).error}`)))
      .catch((e) => setServerErr(String(e)));

    const onMsg = (e: MessageEvent) => {
      if (e.source !== window || e.data?.type !== "MYNA_AUDIT_RESULT" || e.data.sessionId !== sessionId) return;
      setProver(e.data.audit ?? "missing");
    };
    window.addEventListener("message", onMsg);
    const ask = () => window.postMessage({ type: "MYNA_AUDIT_REQUEST", sessionId }, window.location.origin);
    ask();
    const retry = setTimeout(ask, 800); // content script may load after the first ask
    const give = setTimeout(() => setProver((p) => p ?? "missing"), 3000);
    return () => {
      window.removeEventListener("message", onMsg);
      clearTimeout(retry);
      clearTimeout(give);
    };
  }, [sessionId]);

  const v = server?.verifier ?? null;
  const p = prover && prover !== "missing" ? prover : null;

  const views = useMemo(() => {
    if (!v?.transcript) return null;
    const vs = b64(v.transcript.sentB64),
      vr = b64(v.transcript.recvB64);
    const ps = p ? b64(p.sentB64) : null,
      pr = p ? b64(p.recvB64) : null;
    const same = (a: Uint8Array | null, b: Uint8Array, rs: Range[]) =>
      a ? a.length === b.length && rs.every(([s, e]) => a.subarray(s, e).every((x, i) => x === b[s + i])) : null;
    const hiddenZero = (b: Uint8Array, rs: Range[]) => b.every((x, i) => inRanges(i, rs) || x === 0);
    const verifierSentText = v.transcript.sentAuthed.map(([s, e]) => utf8.decode(vs.subarray(s, e))).join("");
    return {
      vs,
      vr,
      ps,
      pr,
      sentMatch: same(ps, vs, v.transcript.sentAuthed),
      recvMatch: same(pr, vr, v.transcript.recvAuthed),
      hiddenZero: hiddenZero(vs, v.transcript.sentAuthed) && hiddenZero(vr, v.transcript.recvAuthed),
      cookieHidden: !/cookie/i.test(verifierSentText),
      revealedRecvBytes: v.transcript.recvAuthed.reduce((n, [s, e]) => n + e - s, 0),
    };
  }, [v, p]);

  function download() {
    const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>mynachat audit ${sessionId.slice(0, 8)}</title></head><body>${rootRef.current?.outerHTML ?? ""}</body></html>`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    a.download = `mynachat-audit-${sessionId.slice(0, 8)}.html`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  if (serverErr) return <p className="error">Audit unavailable: {serverErr}</p>;
  if (!server || prover === null) return <p className="muted">Loading audit…</p>;

  const leaf = v?.wire?.certChain?.[0];
  const w = v?.wire;
  const passed = v?.outcome?.passed ?? null;

  return (
    <>
      <p className="noprint">
        <button onClick={download}>Download report (HTML)</button>{" "}
        <span className="muted small">
          Contains your revealed data and, if the extension answered, your full Myna Portal response. Keep it local.
        </span>
      </p>
      <div id="audit" ref={rootRef}>
        <style>{CSS}</style>
        <h1>Proof audit</h1>
        <table className="kv">
          <tbody>
            <tr>
              <th>Session</th>
              <td>
                <code>{sessionId}</code>
              </td>
            </tr>
            <tr>
              <th>Group / method</th>
              <td>
                {v?.groupId ?? String(server.session?.group_id)} / {v?.method ?? String(server.session?.method)}
              </td>
            </tr>
            <tr>
              <th>Verdict</th>
              <td className={passed ? "okc" : "badc"}>
                {passed === null ? "—" : passed ? "PASSED" : "FAILED"}{" "}
                {v?.outcome && <code>{JSON.stringify(v.outcome.evidence)}</code>}
              </td>
            </tr>
            <tr>
              <th>Started</th>
              <td>{v?.startedAt ?? "—"}</td>
            </tr>
            <tr>
              <th>Generated</th>
              <td>{new Date().toISOString()}</td>
            </tr>
          </tbody>
        </table>

        <h2>Checks</h2>
        <ul className="checks">
          <Check ok={v ? v.tls.serverName === "myna.go.jp" : null}>
            Server identity proven: <code>{v?.tls.serverName ?? "?"}</code>
          </Check>
          <Check ok={w ? w.serverHelloVersion === "0303" && !!w.cipherSuite : null}>
            TLS 1.2, <code>{w?.cipherSuite ?? "?"}</code> (from the handshake on the wire)
          </Check>
          <Check ok={leaf ? /CN=myna\.go\.jp/.test(leaf.subject) : null}>
            Leaf certificate is for myna.go.jp, chain to <code>{w?.certChain?.at(-1)?.issuer ?? "?"}</code>; checked by
            tlsn against the Mozilla roots
          </Check>
          <Check ok={v ? v.timeline.some((e) => e.event.startsWith("MPC-TLS finished")) : null}>
            MPC-TLS completed and the transcript was committed before disclosure
          </Check>
          <Check ok={v ? v.tls.recvRecords.types.every((t) => !t.startsWith("ApplicationData (plaintext)")) : null}>
            Verifier never held plaintext application data (only jointly computed handshake/alert records)
          </Check>
          <Check ok={views ? views.hiddenZero : null}>Every unrevealed byte in the verifier's transcript is zero</Check>
          <Check ok={views ? views.cookieHidden : null}>Cookie header not revealed</Check>
          <Check ok={v?.disclosed && v.criteria ? v.disclosed.requestPath === v.criteria.expectedPath : null}>
            Revealed request path <code>{v?.disclosed?.requestPath ?? "?"}</code> matches the method
          </Check>
          <Check ok={views?.sentMatch ?? null}>Revealed request bytes identical in prover and verifier views</Check>
          <Check ok={views?.recvMatch ?? null}>
            Revealed response bytes identical in prover and verifier views ({views?.revealedRecvBytes ?? "?"} of{" "}
            {v?.transcript?.recvLen ?? "?"} bytes)
          </Check>
          <Check ok={passed}>Group criteria satisfied</Check>
          <Check ok={server.session ? ["myna_verified", "member"].includes(String(server.session.state)) : null}>
            Web app recorded the result: <code>{String(server.session?.state ?? "no session")}</code>
          </Check>
        </ul>
        {prover === "missing" && (
          <p className="muted small">
            The extension did not return a prover view for this session (it is kept only until the browser closes).
            Prover-side comparisons are shown as “–”.
          </p>
        )}

        <h2>1. Myna Portal exchange: what the prover saw</h2>
        {p && views?.ps && views.pr ? (
          <>
            <p className="muted small">
              Full plaintext as the extension saw it. Cookie values replaced by <code>*</code> for this report (
              {p.request.cookieNames.join(", ")}). <mark>Highlighted</mark> = revealed to the verifier. Response HTTP{" "}
              {p.responseStatus}; {p.drugCount} <code>drugN</code> entries; matched{" "}
              <code>{p.matched?.value ?? "none"}</code>.
            </p>
            <h3>Request ({views.ps.length} bytes)</h3>
            <Transcript bytes={views.ps} revealed={p.revealed.sent} mode="prover" />
            <h3>Response ({views.pr.length} bytes)</h3>
            <Transcript bytes={views.pr} revealed={p.revealed.recv} mode="prover" />
          </>
        ) : (
          <p className="muted">Not available.</p>
        )}

        <h2>2. What the verifier saw</h2>
        {v?.transcript && views ? (
          <>
            <p className="muted small">
              The verifier's own copy of the transcript after disclosure. Hidden runs are zero bytes it cannot read.
            </p>
            <h3>
              Request ({v.transcript.sentLen} bytes, revealed {JSON.stringify(v.transcript.sentAuthed)})
            </h3>
            <Transcript bytes={views.vs} revealed={v.transcript.sentAuthed} mode="verifier" />
            <h3>
              Response ({v.transcript.recvLen} bytes, revealed {JSON.stringify(v.transcript.recvAuthed)})
            </h3>
            <Transcript bytes={views.vr} revealed={v.transcript.recvAuthed} mode="verifier" />
            <h3>Parsed disclosure</h3>
            <Json v={v.disclosed} />
          </>
        ) : (
          <p className="muted">No verifier audit file for this session.</p>
        )}

        {v && (
          <>
            <h2>3. On the wire (verifier's relay)</h2>
            <table className="kv">
              <tbody>
                <tr>
                  <th>Captured</th>
                  <td>{w?.capturedBytes ?? 0} bytes of the server's first flight</td>
                </tr>
                <tr>
                  <th>Records</th>
                  <td>{w?.recordTypes.join(", ")}</td>
                </tr>
                <tr>
                  <th>ServerHello</th>
                  <td>
                    version {w?.serverHelloVersion}, {w?.cipherSuite}
                  </td>
                </tr>
                <tr>
                  <th>TLS (tlsn)</th>
                  <td>
                    {v.tls.version}, connection time{" "}
                    {v.tls.connectionTimeUnix ? new Date(v.tls.connectionTimeUnix * 1000).toISOString() : "?"}
                  </td>
                </tr>
                <tr>
                  <th>Chain check</th>
                  <td className="small">{v.tls.certChainCheck}</td>
                </tr>
                <tr>
                  <th>Records to server</th>
                  <td>
                    {v.tls.sentRecords.count} ({v.tls.sentRecords.types.join(", ")}),{" "}
                    {v.tls.sentRecords.ciphertextBytes} ciphertext bytes
                  </td>
                </tr>
                <tr>
                  <th>Records from server</th>
                  <td>
                    {v.tls.recvRecords.count} ({v.tls.recvRecords.types.join(", ")}),{" "}
                    {v.tls.recvRecords.ciphertextBytes} ciphertext bytes
                  </td>
                </tr>
                <tr>
                  <th>First response ciphertext</th>
                  <td>
                    <code>{v.tls.recvRecords.firstCiphertextHex}…</code>
                  </td>
                </tr>
              </tbody>
            </table>
            <h3>Certificate chain</h3>
            <table className="grid">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Subject</th>
                  <th>Issuer</th>
                  <th>Valid</th>
                  <th>SHA-256</th>
                </tr>
              </thead>
              <tbody>
                {w?.certChain.map((c, i) => (
                  <tr key={i}>
                    <td>{i}</td>
                    <td className="small">{c.subject}</td>
                    <td className="small">{c.issuer}</td>
                    <td className="small">
                      {c.notBefore} – {c.notAfter}
                    </td>
                    <td className="small">
                      <code>{c.sha256.slice(0, 16)}…</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <h2>4. Verifier internals</h2>
            <h3>Timeline</h3>
            <table className="grid">
              <thead>
                <tr>
                  <th>+ms</th>
                  <th>Event</th>
                </tr>
              </thead>
              <tbody>
                {v.timeline.map((e, i) => (
                  <tr key={i}>
                    <td>{e.tMs}</td>
                    <td>{e.event}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <h3>Limits</h3>
            <Json v={v.limits} />
            <h3>Criteria</h3>
            <Json v={v.criteria} />
            <h3>Outcome sent to the web app</h3>
            <Json v={v.outcome} />
            <p className="small">
              Report: <code>{v.report ?? "not sent"}</code>
              {v.error && (
                <>
                  {" "}
                  · Error: <code>{v.error}</code>
                </>
              )}
            </p>
          </>
        )}

        {p && (
          <>
            <h2>5. Prover (extension) timeline</h2>
            <table className="grid">
              <thead>
                <tr>
                  <th>+ms</th>
                  <th>Stage</th>
                </tr>
              </thead>
              <tbody>
                {p.timeline.map((e, i) => (
                  <tr key={i}>
                    <td>{e.tMs}</td>
                    <td>{e.stage}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        <h2>6. Web app record</h2>
        <Json v={server.session} />
      </div>
    </>
  );
}

const CSS = `
#audit { font: 14px/1.55 system-ui, -apple-system, "Hiragino Sans", "Noto Sans JP", sans-serif; }
#audit h1 { font-size: 22px; } #audit h2 { font-size: 17px; margin-top: 28px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
#audit h3 { font-size: 14px; margin: 16px 0 6px; }
#audit table { border-collapse: collapse; width: 100%; margin: 6px 0; }
#audit th, #audit td { text-align: left; vertical-align: top; padding: 4px 8px; border-bottom: 1px solid #e5e5e5; }
#audit table.kv th { width: 170px; white-space: nowrap; color: #666; font-weight: 500; }
#audit .small { font-size: 12px; }
#audit code { font-size: 12px; word-break: break-all; }
#audit pre.tx, #audit pre.json { white-space: pre-wrap; word-break: break-all; font-size: 12px; line-height: 1.5; background: rgba(127,127,127,.08); padding: 10px; border-radius: 6px; max-height: 480px; overflow: auto; }
#audit mark { background: #ffe58a; color: #000; border-radius: 2px; }
#audit .hidden-run { background: rgba(127,127,127,.25); color: #777; border-radius: 3px; padding: 0 4px; font-style: italic; }
#audit ul.checks { list-style: none; padding: 0; } #audit ul.checks li { padding: 3px 0; }
#audit .mark { display: inline-block; width: 1.4em; font-weight: 700; }
#audit li.ok .mark, #audit .okc { color: #1f7a4d; } #audit li.bad .mark, #audit .badc { color: #b3261e; } #audit li.na .mark { color: #999; }
#audit .okc, #audit .badc { font-weight: 700; }
`;
