"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { browserSupportsWebAuthn, startRegistration } from "@simplewebauthn/browser";
import Steps from "./Steps";
import WorldIdButton from "./WorldIdButton";
import { api, errMsg } from "@/lib/api";
import type { WorldConfig } from "@/lib/world-config";

type Props = { world: WorldConfig; next: string; devFakeWorld: boolean };
type Phase = "human" | "session" | "passkey";

/**
 * Signup, three steps:
 *  1. World ID uniqueness proof ("account"): one account per human. World App refuses a
 *     second proof for the same person (nullifier_replayed), so that means "already signed up".
 *  2. World ID session: saved on the account, so the same person can recover it later.
 *  3. Username and passkey.
 */
export default function SignupFlow({ world, next, devFakeWorld }: Props) {
  const router = useRouter();
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
      if (!browserSupportsWebAuthn()) throw new Error("このブラウザはパスキーに対応していません / This browser doesn't support passkeys");
      const { challengeId, options } = await api("/api/passkey/register/options", { signupId, username });
      const response = await startRegistration({ optionsJSON: options });
      await api("/api/passkey/register/verify", { challengeId, response });
      router.push(next);
      router.refresh();
    } catch (err) {
      const m = errMsg(err);
      const expired = /expired|World ID first|recovery first/.test(m);
      setError(expired ? `${m}. もう一度 World ID から / Start again from World ID.` : m);
      if (expired) void restart();
    } finally {
      setBusy(false);
    }
  }

  const step = (p: Phase) => {
    const order: Phase[] = ["human", "session", "passkey"];
    const d = order.indexOf(p) - order.indexOf(phase);
    return d < 0 ? "done" : d === 0 ? "current" : "todo";
  };

  if (alreadyHasAccount) {
    return (
      <section className="card stack">
        <h2 className="flush">この World ID にはすでにアカウントがあります / You already have an account</h2>
        <p className="small muted">
          1人につき1アカウントです。この端末にパスキーがあればログインしてください。パスキーをなくした場合は、World ID で復旧できます。
          <br />
          It&apos;s one account per person. Log in with your passkey, or recover the account with World ID if you lost it.
        </p>
        <div className="row">
          <Link className="button" href={`/login?next=${encodeURIComponent(next)}`}>ログイン / Log in</Link>
          <Link className="button secondary" href={`/recover?next=${encodeURIComponent(next)}`}>復旧する / Recover</Link>
        </div>
      </section>
    );
  }

  return (
    <div className="stack">
      <Steps
        steps={[
          { label: "本人確認 / Verify with World ID", state: step("human") },
          { label: "復旧の設定 / Recovery", state: step("session") },
          { label: "ユーザー名とパスキー / Username & passkey", state: step("passkey") },
        ]}
      />

      {phase === "human" && (
        <section className="card stack">
          <h2 className="flush">1. World ID で本人確認 / Verify with World ID</h2>
          <p className="small muted">
            1人につき1アカウントだけ作れます。あなたが誰かは分かりませんが、同じ人が2つ目のアカウントを作ることはできません。退会処分を受けた人が別アカウントで戻ってくることも防ぎます。
            <br />
            One account per human. We learn nothing about who you are, only that you haven&apos;t made an account before. This
            keeps sock puppets and banned users out of patient communities.
          </p>
          <div className="row">
            <WorldIdButton
              world={world}
              context={{ purpose: "account", signupId }}
              disabled={!signupId}
              label="World ID で確認 / Verify with World ID"
              onVerify={async (idkitResult) => {
                await api("/api/signup/world-id", { signupId, idkitResult });
              }}
              onSuccess={() => setPhase("session")}
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

      {phase === "session" && (
        <section className="card stack">
          <h2 className="flush">2. 復旧の設定 / Set up recovery</h2>
          <p className="small muted">
            もう一度 World App で確認してください。パスキーをなくしたり端末を変えたりしたときに、同じ World ID でこのアカウントに戻れるようになります。
            <br />
            Confirm once more in World App. If you lose your passkey or change devices, the same World ID brings you back to
            this account.
          </p>
          <div className="row">
            <WorldIdButton
              world={world}
              context={{ purpose: "account-session", signupId }}
              label="World ID で設定 / Set up with World ID"
              onVerify={async (idkitResult) => {
                await api("/api/signup/world-session", { signupId, idkitResult });
              }}
              onSuccess={() => setPhase("passkey")}
              onError={setError}
            />
          </div>
        </section>
      )}

      {phase === "passkey" && (
        <form className="card stack" onSubmit={createPasskey}>
          <h2 className="flush">3. ユーザー名とパスキー / Username & passkey</h2>
          <label className="field">
            <span>ユーザー名 / Username</span>
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
              {available === null ? "3–20文字、英数字と _ / 3–20 characters: A–Z, 0–9, _" : available.ok ? "✓ 使えます / available" : available.reason}
            </span>
          </label>
          <p className="small muted">
            ユーザー名はログインと復旧に使い、掲示板には表示されません。掲示板ではグループごとに別の表示名を使います。
            <br />
            Your username is for logging in and recovery, and is never shown on boards. Each group gets its own display name,
            so groups can&apos;t be linked to each other.
          </p>
          <div className="row">
            <button type="submit" disabled={busy || !available?.ok}>
              {busy ? "…" : "パスキーを作成 / Create passkey"}
            </button>
            <span className="small muted">Touch ID、Face ID、Windows Hello、スマホなど / Touch ID, Face ID, Windows Hello, or your phone</span>
          </div>
        </form>
      )}

      {error && <p className="error">{error}</p>}
    </div>
  );
}
