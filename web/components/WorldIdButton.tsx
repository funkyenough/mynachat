"use client";

import { useState } from "react";
import { CredentialRequest, IDKitRequestWidget, type IDKitResult, type RpContext } from "@worldcoin/idkit";
import { api, errMsg } from "@/lib/api";
import type { WorldConfig } from "@/lib/world-config";

type Props = {
  world: WorldConfig;
  /** Body for /api/world-id/context: which action to sign and what to bind as the signal. */
  context: Record<string, unknown>;
  label: React.ReactNode;
  disabled?: boolean;
  className?: string;
  /** Sends the proof to the backend; throw to show an error in the widget. */
  onVerify: (result: IDKitResult) => Promise<void>;
  onSuccess: () => void;
  onError: (message: string) => void;
};

/** A button that fetches a signed IDKit request for one action, then opens the World ID widget. */
export default function WorldIdButton({ world, context, label, disabled, className, onVerify, onSuccess, onError }: Props) {
  const [req, setReq] = useState<{ rpContext: RpContext; action: string; signal: string } | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);
    try {
      setReq(await api("/api/world-id/context", context));
      setOpen(true);
    } catch (e) {
      onError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className={className} onClick={start} disabled={disabled || busy}>
        {busy ? "…" : label}
      </button>
      {req && (
        <IDKitRequestWidget
          open={open}
          onOpenChange={setOpen}
          app_id={world.appId}
          action={req.action}
          rp_context={req.rpContext}
          // 4.0 only. The credential is a bare constraint, not a preset: IDKit's presets
          // (mnc(), passport(), proofOfHuman()) carry a 3.0 fallback that World App answers
          // with an Orb proof.
          allow_legacy_proofs={false}
          environment={world.environment}
          constraints={CredentialRequest(world.credential, { signal: req.signal })}
          handleVerify={onVerify}
          onSuccess={onSuccess}
          onError={(code) => onError(`World ID: ${code}`)}
        />
      )}
    </>
  );
}
