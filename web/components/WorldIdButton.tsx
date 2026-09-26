"use client";

import { useState } from "react";
import {
  CredentialRequest,
  IDKitRequestWidget,
  IDKitSessionWidget,
  type IDKitResult,
  type RpContext,
} from "@worldcoin/idkit";
import { api, errMsg } from "@/lib/api";
import type { WorldConfig } from "@/lib/world-config";

type Props = {
  world: WorldConfig;
  /**
   * Body for /api/world-id/context: which proof to request and what to bind as the signal.
   * The server answers with a uniqueness request (an action) or a session request (create or prove).
   */
  context: Record<string, unknown>;
  label: React.ReactNode;
  disabled?: boolean;
  className?: string;
  /** Sends the proof to the backend; throw to show an error in the widget. */
  onVerify: (result: IDKitResult) => Promise<void>;
  onSuccess: () => void;
  onError: (message: string) => void;
};

type SignedRequest = {
  rpContext: RpContext;
  signal: string;
  action?: string;
  session?: "create" | "prove";
  sessionId?: `session_${string}`;
};

/** A button that fetches a signed IDKit request, then opens the matching World ID widget. */
export default function WorldIdButton({ world, context, label, disabled, className, onVerify, onSuccess, onError }: Props) {
  const [req, setReq] = useState<SignedRequest | null>(null);
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
      {req?.session && (
        <IDKitSessionWidget
          open={open}
          onOpenChange={setOpen}
          app_id={world.appId}
          rp_context={req.rpContext}
          environment={world.environment}
          constraints={CredentialRequest(world.credential, { signal: req.signal })}
          existing_session_id={req.session === "prove" ? req.sessionId : undefined}
          handleVerify={onVerify}
          onSuccess={onSuccess}
          onError={(code) => onError(`World ID: ${code}`)}
        />
      )}
      {req && !req.session && req.action && (
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
