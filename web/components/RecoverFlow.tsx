"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { browserSupportsWebAuthn, startRegistration } from "@simplewebauthn/browser";
import Steps from "./Steps";
import WorldIdButton from "./WorldIdButton";
import { useT } from "./LangProvider";
import { api, errMsg } from "@/lib/api";
import type { WorldConfig } from "@/lib/world-config";

type Props = { world: WorldConfig; next: string; devFakeWorld: boolean };
type Phase = "account" | "world" | "passkey";

/**
 * Account recovery on a new device: name the account, prove its saved World ID session in
 * World App, then register a new passkey. Group memberships stay with the account.
 */
export default function RecoverFlow({ world, next, devFakeWorld }: Props) {
  const router = useRouter();
  const { t } = useT();
  const [phase, setPhase] = useState<Phase>("account");
  const [username, setUsername] = useState("");
  const [recoveryId, setRecoveryId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setRecoveryId((await api<{ recoveryId: string }>("/api/recover/start", { username })).recoveryId);
      setPhase("world");
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  async function fakeWorld() {
    try {
      await api("/api/dev/fake-world-id", { purpose: "recover", recoveryId });
      setPhase("passkey");
    } catch (e) {
      setError(errMsg(e));
    }
  }

  async function createPasskey() {
    setBusy(true);
    setError(null);
    try {
      if (!browserSupportsWebAuthn()) throw new Error(t("このブラウザはパスキーに対応していません", "This browser doesn't support passkeys"));
      const { challengeId, options } = await api("/api/passkey/register/options", { signupId: recoveryId });
      const response = await startRegistration({ optionsJSON: options });
      await api("/api/passkey/register/verify", { challengeId, response });
      router.push(next);
      router.refresh();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  const order: Phase[] = ["account", "world", "passkey"];
  const step = (p: Phase) => {
    const d = order.indexOf(p) - order.indexOf(phase);
    return d < 0 ? "done" : d === 0 ? "current" : "todo";
  };

  return (
    <div className="stack">
      <Steps
        steps={[
          { label: t("アカウント", "Account"), state: step("account") },
          { label: t("World ID で確認", "Verify with World ID"), state: step("world") },
          { label: t("新しいパスキー", "New passkey"), state: step("passkey") },
        ]}
      />

      {phase === "account" && (
        <form className="card stack" onSubmit={start}>
          <label className="field">
            <span>{t("ユーザー名", "Username")}</span>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value.trim())}
              autoComplete="username"
              maxLength={20}
              required
              autoFocus
            />
          </label>
          <div className="row">
            <button type="submit" disabled={busy || !username}>{busy ? "…" : t("次へ", "Next")}</button>
          </div>
        </form>
      )}

      {phase === "world" && (
        <section className="card stack">
          <p className="small muted">
            {t(
              <>アカウント <strong>{username}</strong> を作成したときと同じ World ID で確認してください。ほかの人の World ID では復旧できません。</>,
              <>Confirm with the same World ID you used to create <strong>{username}</strong>. Nobody else&apos;s World ID can recover it.</>,
            )}
          </p>
          <div className="row">
            <WorldIdButton
              world={world}
              context={{ purpose: "recover", recoveryId }}
              label={t("World ID で確認", "Verify with World ID")}
              onVerify={async (idkitResult) => {
                await api("/api/recover/verify", { recoveryId, idkitResult });
              }}
              onSuccess={() => setPhase("passkey")}
              onError={setError}
            />
            {devFakeWorld && (
              <button type="button" className="secondary" onClick={fakeWorld}>Fake World ID (dev)</button>
            )}
          </div>
        </section>
      )}

      {phase === "passkey" && (
        <section className="card stack">
          <p>
            {t(
              <>✓ 確認できました。この端末用のパスキーを作成すると、<strong>{username}</strong> としてログインします。</>,
              <>✓ Verified. Create a passkey on this device to log in as <strong>{username}</strong>.</>,
            )}
          </p>
          <div className="row">
            <button onClick={createPasskey} disabled={busy}>{busy ? "…" : t("パスキーを作成", "Create passkey")}</button>
          </div>
        </section>
      )}

      {error && <p className="error">{error}</p>}
    </div>
  );
}
