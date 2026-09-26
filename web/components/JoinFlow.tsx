"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Steps from "./Steps";
import { useT } from "./LangProvider";
import { api, errMsg } from "@/lib/api";

export type MethodOption = {
  id: string;
  name: { ja: string; en: string };
  available: boolean;
  note?: string;
};

type Props = {
  group: { id: string; name: { ja: string; en: string } };
  methods: MethodOption[];
  verifierUrl: string;
  devFakeMyna: boolean;
};

type EnrollState = "pending" | "myna_verified" | "failed" | "member";

const EXTENSION_TIMEOUT_MS = 5000;
const POLL_MS = 1500;

const STAGE_LABELS: Record<string, [ja: string, en: string]> = {
  opening_portal: ["マイナポータルを開いています", "Opening Myna Portal"],
  waiting_login: ["ログインを待っています", "Waiting for you to log in"],
  connecting: ["検証者に接続中", "Connecting to verifier"],
  proving: ["MPC-TLS 証明中", "Running MPC-TLS proof"],
  submitting: ["結果を送信中", "Submitting result"],
};

const WORDS = ["sakura", "kaede", "sora", "umi", "hoshi", "kumo", "mori", "yuki", "tsuki", "kaze"];
const randomHandle = () =>
  `${WORDS[Math.floor(Math.random() * WORDS.length)]}-${Math.random().toString(16).slice(2, 6)}`;

/** Joining a group, for a logged-in account: display name + method, then the Myna Portal proof. */
export default function JoinFlow({ group, methods, verifierUrl, devFakeMyna }: Props) {
  const router = useRouter();
  const { lang, t } = useT();
  const [method, setMethod] = useState(methods.find((m) => m.available)?.id ?? "");
  const [handle, setHandle] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [state, setState] = useState<EnrollState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stages, setStages] = useState<string[]>([]);
  const [extensionSeen, setExtensionSeen] = useState(false);
  const [extensionMissing, setExtensionMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const extTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setHandle(randomHandle()), []);

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
        if (!d.passed) setError(d.error ? String(d.error) : t("証明に失敗しました", "Proof failed"));
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
        const d = await api(`/api/enroll/status?sessionId=${encodeURIComponent(sessionId)}`);
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

  // Eligibility proven: become a member and go to the board.
  useEffect(() => {
    if (!sessionId || state !== "myna_verified") return;
    api("/api/enroll/complete", { sessionId })
      .then(() => {
        setState("member");
        router.push(`/groups/${group.id}`);
        router.refresh();
      })
      .catch((e) => setError(errMsg(e)));
  }, [sessionId, state, group.id, router]);

  const startProof = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setBusy(true);
      setError(null);
      setStages([]);
      setExtensionSeen(false);
      setExtensionMissing(false);
      try {
        const { sessionId } = await api("/api/enroll/start", { groupId: group.id, method, handle });
        sessionRef.current = sessionId;
        setSessionId(sessionId);
        setState("pending");
        window.postMessage(
          { type: "MYNA_PROVE_REQUEST", sessionId, groupId: group.id, method, verifierUrl },
          window.location.origin,
        );
        if (extTimer.current) clearTimeout(extTimer.current);
        extTimer.current = setTimeout(() => setExtensionMissing(true), EXTENSION_TIMEOUT_MS);
      } catch (err) {
        setError(errMsg(err));
      } finally {
        setBusy(false);
      }
    },
    [group.id, method, handle, verifierUrl],
  );

  const fakeMyna = useCallback(async () => {
    if (!sessionId) return;
    try {
      await api("/api/dev/fake-myna", { sessionId });
      setExtensionMissing(false);
      setState("myna_verified");
    } catch (e) {
      setError(errMsg(e));
    }
  }, [sessionId]);

  const proving = state === "pending";
  const started = state !== null && state !== "failed";

  return (
    <div className="stack">
      <Steps
        steps={[
          { label: t("アカウント", "Account"), state: "done" },
          { label: t("表示名・方法", "Name & method"), state: started ? "done" : "current" },
          {
            label: t("マイナで証明", "Prove"),
            state: state === "myna_verified" || state === "member" ? "done" : started ? "current" : "todo",
          },
          { label: t("参加", "Join"), state: state === "member" ? "done" : state === "myna_verified" ? "current" : "todo" },
        ]}
      />

      <form className="card stack" onSubmit={startProof}>
        <h2 className="flush">{t("表示名", "Display name in this group")}</h2>
        <div className="row">
          <input
            type="text"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            maxLength={20}
            minLength={2}
            required
            disabled={started}
            style={{ flex: 1, minWidth: 160 }}
          />
          <button type="button" className="secondary" onClick={() => setHandle(randomHandle())} disabled={started}>
            🎲 {t("ランダム", "Random")}
          </button>
        </div>
        <p className="small muted">
          {t(
            "このグループだけで使う名前です。他のグループやユーザー名とは結びつきません。",
            "Used only in this group, and never linked to your username or your other groups.",
          )}
        </p>

        <h2>{t("証明方法", "Proof method")}</h2>
        <div className="stack">
          {methods.map((m) => (
            <label key={m.id} className={`option${m.available ? "" : " disabled"}`}>
              <input
                type="radio"
                name="method"
                value={m.id}
                disabled={!m.available || started}
                checked={method === m.id}
                onChange={() => setMethod(m.id)}
              />
              <span>
                {m.name[lang]}
                {!m.available && (
                  <span className="muted small">
                    {" "}
                    ({m.id === "diagnosis" ? t("2027年予定", "coming 2027") : t("準備中", "coming soon")})
                  </span>
                )}
              </span>
            </label>
          ))}
        </div>

        <p className="small muted">
          {t(
            "マイナポータルの自分のデータから、参加条件を満たすことだけを証明します。記録そのものはグループに送られません。",
            "Proves only that your own Myna Portal data meets the group's criteria. Your records are never sent to the group.",
          )}
        </p>
        <div className="row">
          <button type="submit" disabled={!method || busy || started}>
            {state === "failed" ? t("もう一度", "Try again") : t("マイナポータルで証明", "Prove with Myna Portal")}
          </button>
          {proving && <span className="muted">{t("証明中…", "Proving…")}</span>}
          {(state === "myna_verified" || state === "member") && (
            <span className="ok">{t("✓ 資格を確認しました", "✓ Eligibility verified")}</span>
          )}
        </div>

        {stages.length > 0 && (
          <ul className="steps small">
            {stages.map((s) => (
              <li key={s}>• {STAGE_LABELS[s] ? t(...STAGE_LABELS[s]) : s}</li>
            ))}
          </ul>
        )}
        {proving && extensionMissing && (
          <p className="small">
            {t(
              "拡張機能から応答がありません。mynachat Chrome拡張機能をインストールして有効にし、このページを再読み込みしてください。",
              "No response from the extension. Install and enable the mynachat Chrome extension, then reload this page.",
            )}
          </p>
        )}
        {devFakeMyna && proving && (
          <div className="card dev small row">
            <span>DEV_FAKE_MYNA=1</span>
            <button type="button" className="secondary" onClick={fakeMyna}>
              Fake Myna verification (dev)
            </button>
          </div>
        )}
        {sessionId && state !== "pending" && (
          <a className="small" href={`/audit/${sessionId}`} target="_blank" rel="noreferrer">
            {t("証明の監査レポート", "Proof audit report")} →
          </a>
        )}
      </form>

      {error && <p className="error">{error}</p>}
    </div>
  );
}
