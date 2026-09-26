"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { IDKitRequestWidget, orbLegacy, type IDKitResult, type RpContext } from "@worldcoin/idkit";

export type MethodOption = {
  id: string;
  name: { ja: string; en: string };
  available: boolean;
  note?: string;
};

type Props = {
  group: { id: string; name: { ja: string; en: string } };
  methods: MethodOption[];
  appId: `app_${string}`;
  environment: "production" | "staging";
  verifierUrl: string;
  devFakeMyna: boolean;
};

type EnrollState = "pending" | "myna_verified" | "failed" | "member";

const EXTENSION_TIMEOUT_MS = 5000;
const POLL_MS = 1500;

const STAGE_LABELS: Record<string, string> = {
  opening_portal: "マイナポータルを開いています / Opening Myna Portal",
  waiting_login: "ログインを待っています / Waiting for you to log in",
  connecting: "検証者に接続中 / Connecting to verifier",
  proving: "MPC-TLS 証明中 / Running MPC-TLS proof",
  submitting: "結果を送信中 / Submitting result",
};

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
  return data;
}

export default function JoinFlow({ group, methods, appId, environment, verifierUrl, devFakeMyna }: Props) {
  const router = useRouter();
  const firstAvailable = methods.find((m) => m.available)?.id ?? "";
  const [method, setMethod] = useState(firstAvailable);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [state, setState] = useState<EnrollState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stages, setStages] = useState<string[]>([]);
  const [extensionSeen, setExtensionSeen] = useState(false);
  const [extensionMissing, setExtensionMissing] = useState(false);
  const [busy, setBusy] = useState(false);

  const [rpContext, setRpContext] = useState<RpContext | null>(null);
  const [widgetOpen, setWidgetOpen] = useState(false);
  const extTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Messages from the extension's content script. Attached once; filtered by the current session.
  const sessionRef = useRef<string | null>(null);
  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      if (ev.source !== window || ev.origin !== window.location.origin) return;
      const d = ev.data;
      if (!d || typeof d !== "object" || typeof d.type !== "string" || !sessionRef.current) return;
      if (d.sessionId !== undefined && d.sessionId !== sessionRef.current) return;
      if (d.type === "MYNA_PROVE_PROGRESS") {
        setExtensionSeen(true);
        setExtensionMissing(false);
        if (typeof d.stage === "string") setStages((s) => (s[s.length - 1] === d.stage ? s : [...s, d.stage]));
      } else if (d.type === "MYNA_PROVE_RESULT") {
        setExtensionSeen(true);
        setExtensionMissing(false);
        if (!d.passed) setError(d.error ? String(d.error) : "証明に失敗しました / Proof failed");
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    if (extensionSeen && extTimer.current) clearTimeout(extTimer.current);
  }, [extensionSeen]);

  // Poll the backend until the Myna step settles.
  useEffect(() => {
    if (!sessionId || state !== "pending") return;
    const t = setInterval(async () => {
      try {
        const res = await fetch(`/api/enroll/status?sessionId=${encodeURIComponent(sessionId)}`);
        const d = await res.json();
        if (d.state && d.state !== "pending") {
          setState(d.state);
          if (d.error) setError(d.error);
        }
      } catch {
        /* keep polling */
      }
    }, POLL_MS);
    return () => clearInterval(t);
  }, [sessionId, state]);

  // Once Myna-verified, fetch the RP signature for IDKit.
  useEffect(() => {
    if (!sessionId || state !== "myna_verified" || rpContext) return;
    postJson("/api/rp-signature", { sessionId })
      .then((d) =>
        setRpContext({
          rp_id: d.rp_id,
          nonce: d.nonce,
          created_at: d.created_at,
          expires_at: d.expires_at,
          signature: d.sig,
        }),
      )
      .catch((e) => setError(`RP signature: ${e.message}`));
  }, [sessionId, state, rpContext]);

  const startProof = useCallback(async () => {
    setBusy(true);
    setError(null);
    setStages([]);
    setExtensionSeen(false);
    setExtensionMissing(false);
    setRpContext(null);
    try {
      const { sessionId } = await postJson("/api/enroll/start", { groupId: group.id, method });
      sessionRef.current = sessionId;
      setSessionId(sessionId);
      setState("pending");
      window.postMessage(
        { type: "MYNA_PROVE_REQUEST", sessionId, groupId: group.id, method, verifierUrl },
        window.location.origin,
      );
      if (extTimer.current) clearTimeout(extTimer.current);
      extTimer.current = setTimeout(() => setExtensionMissing(true), EXTENSION_TIMEOUT_MS);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [group.id, method, verifierUrl]);

  const fakeMyna = useCallback(async () => {
    if (!sessionId) return;
    try {
      await postJson("/api/dev/fake-myna", { sessionId });
      setExtensionMissing(false);
      setState("myna_verified");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [sessionId]);

  const handleVerify = useCallback(
    async (idkitResult: IDKitResult) => {
      await postJson("/api/verify-world-id", { sessionId, idkitResult });
    },
    [sessionId],
  );

  const proving = state === "pending";
  const mynaDone = state === "myna_verified" || state === "member";

  return (
    <div className="stack">
      <h2>1. 証明方法 / Proof method</h2>
      <div className="stack">
        {methods.map((m) => (
          <label key={m.id} className={`option${m.available ? "" : " disabled"}`}>
            <input
              type="radio"
              name="method"
              value={m.id}
              disabled={!m.available || proving || mynaDone}
              checked={method === m.id}
              onChange={() => setMethod(m.id)}
            />
            <span>
              {m.name.ja} / {m.name.en}
              {!m.available && (
                <span className="muted small"> ({m.id === "diagnosis" ? "coming 2027" : m.note ?? "unavailable"})</span>
              )}
            </span>
          </label>
        ))}
      </div>

      <h2>2. マイナポータルで証明 / Prove with Myna Portal</h2>
      <div className="card stack">
        <div className="row">
          <button onClick={startProof} disabled={!method || busy || proving || mynaDone}>
            {state === "failed" ? "もう一度 / Try again" : "マイナポータルで証明 / Prove with Myna Portal"}
          </button>
          {mynaDone && <span className="ok">✓ 資格を確認しました / Eligibility verified</span>}
          {proving && <span className="muted">証明中… / Proving…</span>}
        </div>
        {stages.length > 0 && (
          <ul className="steps small">
            {stages.map((s) => (
              <li key={s}>• {STAGE_LABELS[s] ?? s}</li>
            ))}
          </ul>
        )}
        {proving && extensionMissing && (
          <p className="small">
            拡張機能から応答がありません。mynamedical Chrome 拡張機能をインストールして有効にし、このページを再読み込みしてください。
            <br />
            No response from the extension. Install and enable the mynamedical Chrome extension, then reload this page.
          </p>
        )}
        {devFakeMyna && proving && (
          <div className="card dev small row">
            <span>DEV_FAKE_MYNA=1</span>
            <button className="secondary" onClick={fakeMyna}>Fake Myna verification (dev)</button>
          </div>
        )}
      </div>

      <h2>3. World ID で本人確認 / Verify with World ID</h2>
      <div className="card stack">
        <p className="small muted">
          一人一回だけ参加できるようにするためです。掲示板の匿名 ID はこのグループ専用です。
          <br />
          Ensures one membership per person. Your board pseudonym is unique to this group.
        </p>
        <div className="row">
          <button onClick={() => setWidgetOpen(true)} disabled={state !== "myna_verified" || !rpContext}>
            World ID で確認 / Verify with World ID
          </button>
          {state === "myna_verified" && !rpContext && !error && <span className="muted small">準備中… / Preparing…</span>}
        </div>
        {environment === "staging" && (
          <p className="small muted">
            Staging: use the simulator at{" "}
            <a href="https://simulator.worldcoin.org/" target="_blank" rel="noreferrer">simulator.worldcoin.org</a>.
          </p>
        )}
      </div>

      {error && <p className="error">{error}</p>}

      {rpContext && sessionId && (
        <IDKitRequestWidget
          open={widgetOpen}
          onOpenChange={setWidgetOpen}
          app_id={appId}
          action={`join-${group.id}`}
          rp_context={rpContext}
          allow_legacy_proofs={true}
          environment={environment}
          preset={orbLegacy({ signal: sessionId })}
          handleVerify={handleVerify}
          onSuccess={() => {
            router.push(`/groups/${group.id}`);
            router.refresh();
          }}
          onError={(code) => setError(`World ID: ${code}`)}
        />
      )}
    </div>
  );
}
