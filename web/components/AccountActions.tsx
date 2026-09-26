"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { startRegistration } from "@simplewebauthn/browser";
import WorldIdButton from "./WorldIdButton";
import { useT } from "./LangProvider";
import { api, errMsg } from "@/lib/api";
import type { WorldConfig } from "@/lib/world-config";

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

/** Links a World ID session to an account created before signup saved one. */
export function SetupRecoveryButton({
  world,
  variant,
  label,
}: {
  world: WorldConfig;
  /** Debug experiments: credential and whether to attach the signal. */
  variant?: { credential: "proof_of_human" | "selfie"; signal: boolean };
  label?: string;
}) {
  const router = useRouter();
  const { t } = useT();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <span className="row">
      <WorldIdButton
        world={world}
        context={{ purpose: "link-session", variant }}
        label={label ?? t("World ID で復旧を設定", "Set up recovery with World ID")}
        onVerify={async (idkitResult) => {
          await api("/api/account/world-session", { idkitResult });
        }}
        onSuccess={() => router.refresh()}
        onError={setMsg}
      />
      {msg && <span className="error small">{msg}</span>}
    </span>
  );
}
