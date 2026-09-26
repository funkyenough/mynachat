"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { startRegistration } from "@simplewebauthn/browser";
import { useT } from "./LangProvider";
import { api, errMsg } from "@/lib/api";

export function AddPasskeyButton() {
  const router = useRouter();
  const { t } = useT();
  const [msg, setMsg] = useState<string | null>(null);
  async function add() {
    setMsg(null);
    try {
      const { challengeId, options } = await api("/api/passkey/register/options", {});
      await api("/api/passkey/register/verify", { challengeId, response: await startRegistration({ optionsJSON: options }) });
      router.refresh();
    } catch (e) {
      setMsg(errMsg(e));
    }
  }
  return (
    <span className="row">
      <button className="secondary" onClick={add}>{t("＋ パスキーを追加", "+ Add passkey")}</button>
      {msg && <span className="error small">{msg}</span>}
    </span>
  );
}

export function LogoutButton({ className }: { className?: string }) {
  const router = useRouter();
  const { t } = useT();
  return (
    <button
      className={className ?? "secondary"}
      onClick={async () => {
        await api("/api/logout", {}).catch(() => {});
        router.push("/");
        router.refresh();
      }}
    >
      {t("ログアウト", "Log out")}
    </button>
  );
}

