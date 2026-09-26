"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { browserSupportsWebAuthn, startRegistration } from "@simplewebauthn/browser";
import Steps from "./Steps";
import WorldIdButton from "./WorldIdButton";
import { useT } from "./LangProvider";
import { api, errMsg } from "@/lib/api";
import type { WorldConfig } from "@/lib/world-config";

type Props = { world: WorldConfig; next: string; devFakeWorld: boolean };
type Phase = "human" | "passkey";

/** Signup: a World ID uniqueness proof ("account": one account per human), then a username and a passkey. */
export default function SignupFlow({ world, next, devFakeWorld }: Props) {
  const router = useRouter();
  const { t } = useT();
  const [signupId, setSignupId] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("human");
  const [alreadyHasAccount, setAlreadyHasAccount] = useState(false);
  const [username, setUsername] = useState("");
  const [available, setAvailable] = useState<{ ok: boolean; reason?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const restart = useCallback(async () => {
    setError(null);
    setPhase("human");
    try {
      setSignupId((await api<{ signupId: string }>("/api/signup/start", {})).signupId);
    } catch (e) {
      setError(errMsg(e));
    }
  }, []);
  useEffect(() => void restart(), [restart]);

  useEffect(() => {
    if (!username) return setAvailable(null);
    const t = setTimeout(() => {
      api(`/api/username?u=${encodeURIComponent(username)}`).then(setAvailable).catch(() => setAvailable(null));
    }, 300);
    return () => clearTimeout(t);
  }, [username]);

  const onWorldError = (message: string) => {
    if (/nullifier_replayed|already has an account/.test(message)) setAlreadyHasAccount(true);
    else setError(message);
  };

  async function fakeWorld() {
    try {
      await api("/api/dev/fake-world-id", { purpose: "account", signupId });
      setPhase("passkey");
    } catch (e) {
      setError(errMsg(e));
    }
  }

  async function createPasskey(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (!browserSupportsWebAuthn()) throw new Error(t("このブラウザはパスキーに対応していません", "This browser doesn't support passkeys"));
      const { challengeId, options } = await api("/api/passkey/register/options", { signupId, username });
      const response = await startRegistration({ optionsJSON: options });
      await api("/api/passkey/register/verify", { challengeId, response });
      router.push(next);
      router.refresh();
    } catch (err) {
      const m = errMsg(err);
      const expired = /expired|World ID first/.test(m);
      setError(expired ? `${m}. ${t("もう一度 World ID からやり直してください。", "Start again from World ID.")}` : m);
      if (expired) void restart();
    } finally {
      setBusy(false);
    }
  }

  const step = (p: Phase) => {
    const order: Phase[] = ["human", "passkey"];
    const d = order.indexOf(p) - order.indexOf(phase);
    return d < 0 ? "done" : d === 0 ? "current" : "todo";
  };

  if (alreadyHasAccount) {
    return (
      <section className="card stack">
        <h2 className="flush">{t("この World ID にはすでにアカウントがあります", "You already have an account")}</h2>
        <p className="small muted">
          {t(
            "1人につき1アカウントです。登録したパスキーでログインしてください。",
            "It's one account per person. Log in with the passkey you registered.",
          )}
        </p>
        <div className="row">
          <Link className="button" href={`/login?next=${encodeURIComponent(next)}`}>{t("ログイン", "Log in")}</Link>
        </div>
      </section>
    );
  }

  return (
    <div className="stack">
      <Steps
        steps={[
          { label: t("本人確認", "Verify with World ID"), state: step("human") },
          { label: t("ユーザー名とパスキー", "Username & passkey"), state: step("passkey") },
        ]}
      />

      {phase === "human" && (
        <section className="card stack">
          <h2 className="flush">{t("1. World ID で本人確認", "1. Verify with World ID")}</h2>
          <p className="small muted">
            {t(
              "1人につき1アカウントだけ作れます。あなたが誰かは分かりませんが、同じ人が2つ目のアカウントを作ることはできません。なりすましの複数アカウントを患者コミュニティから締め出します。",
              "One account per human. We learn nothing about who you are, only that you haven't made an account before. This keeps sock puppets out of patient communities.",
            )}
          </p>
          <div className="row">
            <WorldIdButton
              world={world}
              context={{ purpose: "account", signupId }}
              disabled={!signupId}
              label={t("World ID で確認", "Verify with World ID")}
              onVerify={async (idkitResult) => {
                await api("/api/signup/world-id", { signupId, idkitResult });
              }}
              onSuccess={() => setPhase("passkey")}
              onError={onWorldError}
            />
            {devFakeWorld && (
              <button type="button" className="secondary" onClick={fakeWorld} disabled={!signupId}>
                Fake World ID (dev)
              </button>
            )}
          </div>
          {world.environment === "staging" && (
            <p className="small muted">
              Staging: use the simulator at <a href="https://simulator.worldcoin.org/" target="_blank" rel="noreferrer">simulator.worldcoin.org</a>.
            </p>
          )}
        </section>
      )}

      {phase === "passkey" && (
        <form className="card stack" onSubmit={createPasskey}>
          <h2 className="flush">{t("2. ユーザー名とパスキー", "2. Username & passkey")}</h2>
          <label className="field">
            <span>{t("ユーザー名", "Username")}</span>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value.trim())}
              placeholder="e.g. sakura_42"
              autoComplete="username webauthn"
              maxLength={20}
              required
            />
            <span className={`small ${available?.ok ? "ok" : "muted"}`}>
              {available === null ? t("3–20文字、英数字と _", "3–20 characters: A–Z, 0–9, _") : available.ok ? t("✓ 使えます", "✓ available") : available.reason}
            </span>
          </label>
          <p className="small muted">
            {t(
              "ユーザー名はアカウントの識別用で、掲示板には表示されません。掲示板ではグループごとに別の表示名を使います。",
              "Your username identifies your account and is never shown on boards. Each group gets its own display name, so groups can't be linked to each other.",
            )}
          </p>
          <div className="row">
            <button type="submit" disabled={busy || !available?.ok}>
              {busy ? "…" : t("パスキーを作成", "Create passkey")}
            </button>
            <span className="small muted">{t("Touch ID、Face ID、Windows Hello、スマホなど", "Touch ID, Face ID, Windows Hello, or your phone")}</span>
          </div>
        </form>
      )}

      {error && <p className="error">{error}</p>}
    </div>
  );
}
