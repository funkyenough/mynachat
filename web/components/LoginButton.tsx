"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { browserSupportsWebAuthn, startAuthentication } from "@simplewebauthn/browser";
import { api, errMsg } from "@/lib/api";

/** Passkey login. No username needed: the browser offers this site's passkeys. */
export default function LoginButton({ next }: { next: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function login() {
    setBusy(true);
    setError(null);
    try {
      if (!browserSupportsWebAuthn()) throw new Error("このブラウザはパスキーに対応していません / This browser doesn't support passkeys");
      const { challengeId, options } = await api("/api/passkey/login/options", {});
      const response = await startAuthentication({ optionsJSON: options });
      await api("/api/passkey/login/verify", { challengeId, response });
      router.push(next);
      router.refresh();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <button onClick={login} disabled={busy} className="big">
        {busy ? "…" : "🔑 パスキーでログイン / Log in with passkey"}
      </button>
      {error && <p className="error small">{error}</p>}
    </div>
  );
}
