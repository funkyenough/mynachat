"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { browserSupportsWebAuthn, startRegistration } from "@simplewebauthn/browser";
import Steps from "./Steps";
import WorldIdButton from "./WorldIdButton";
import { api, errMsg } from "@/lib/api";
import type { WorldConfig } from "@/lib/world-config";

type Props = { world: WorldConfig; next: string; devFakeWorld: boolean };

/**
 * Signup: World ID first (one account per human), then a username and a passkey.
 * If World ID shows this human already has an account, the same flow registers a new
 * passkey for it instead (recovery on a new device).
 */
export default function SignupFlow({ world, next, devFakeWorld }: Props) {
  const router = useRouter();
  const [signupId, setSignupId] = useState<string | null>(null);
  const [human, setHuman] = useState(false);
  const [existing, setExisting] = useState<{ username: string } | null>(null);
  const [username, setUsername] = useState("");
  const [available, setAvailable] = useState<{ ok: boolean; reason?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const restart = useCallback(async () => {
    setError(null);
    setHuman(false);
    setExisting(null);
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

  async function verifyWorld(idkitResult: unknown) {
    const r = await api<{ existing: { username: string } | null }>("/api/signup/world-id", { signupId, idkitResult });
    setExisting(r.existing);
  }

  async function fakeWorld() {
    try {
      const r = await api<{ existing: { username: string } | null }>("/api/dev/fake-world-id", { purpose: "account", signupId });
      setExisting(r.existing);
      setHuman(true);
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
      const { challengeId, options } = await api("/api/passkey/register/options", { signupId, username: existing ? undefined : username });
      const response = await startRegistration({ optionsJSON: options });
      await api("/api/passkey/register/verify", { challengeId, response });
      router.push(next);
      router.refresh();
    } catch (err) {
      const m = errMsg(err);
      setError(/expired|World ID first/.test(m) ? `${m}. もう一度 World ID から / Start again from World ID.` : m);
      if (/expired|World ID first/.test(m)) void restart();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <Steps
        steps={[
          { label: "本人確認 / Verify with World ID", state: human ? "done" : "current" },
          { label: existing ? "新しいパスキー / New passkey" : "ユーザー名とパスキー / Username & passkey", state: human ? "current" : "todo" },
        ]}
      />

      {!human ? (
        <section className="card stack">
          <h2 className="flush">1. World ID で本人確認 / Verify with World ID</h2>
          <p className="small muted">
            1人につき1アカウントだけ作れます。あなたが誰かは分かりませんが、同じ人が2つ目のアカウントを作ることはできません。退会処分を受けた人が別アカウントで戻ってくることも防ぎます。
            <br />
            One account per human. We learn nothing about who you are, only that you haven't made an account before. This
            keeps sock puppets and banned users out of patient communities.
          </p>
          <div className="row">
            <WorldIdButton
              world={world}
              context={{ purpose: "account", signupId }}
              disabled={!signupId}
              label="World ID で確認 / Verify with World ID"
              onVerify={verifyWorld}
              onSuccess={() => setHuman(true)}
              onError={setError}
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
      ) : (
        <form className="card stack" onSubmit={createPasskey}>
          {existing ? (
            <>
              <h2 className="flush">おかえりなさい / Welcome back, {existing.username}</h2>
              <p className="small muted">
                この World ID にはすでにアカウントがあります。この端末用の新しいパスキーを登録すると、ログインできるようになります。グループのメンバーシップはそのままです。
                <br />
                You already have an account. Register a passkey on this device to log in; your group memberships are kept.
              </p>
            </>
          ) : (
            <>
              <h2 className="flush">2. ユーザー名とパスキー / Username & passkey</h2>
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
                ユーザー名はログイン用で、掲示板には表示されません。掲示板ではグループごとに別の表示名を使います。
                <br />
                Your username is for logging in and is never shown on boards. Each group gets its own display name, so
                groups can't be linked to each other.
              </p>
            </>
          )}
          <div className="row">
            <button type="submit" disabled={busy || (!existing && !available?.ok)}>
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
