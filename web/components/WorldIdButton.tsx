"use client";

import { useRef, useState } from "react";
import {
  CredentialRequest,
  IDKitRequestWidget,
  IDKitSessionWidget,
  setDebug,
  type IDKitDebugReport,
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

/** How long a session request may wait for World App before it fails (and, in debug, reports). */
const SESSION_TIMEOUT_MS = 120_000;

/** Masks proofs, nullifiers, session ids and other long hex so debug reports are safe to log. */
function redact(v: unknown): unknown {
  if (typeof v === "string") {
    if (/^(0x)?[0-9a-fA-F]{32,}$/.test(v) || /^session_[0-9a-fA-F]+$/.test(v)) return `<hex:${v.length}>`;
    return v.length > 400 ? `${v.slice(0, 400)}…<${v.length}>` : v;
  }
  if (Array.isArray(v)) return v.map(redact);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, redact(x)]));
  return v;
}

/** A button that fetches a signed IDKit request, then opens the matching World ID widget. */
export default function WorldIdButton({ world, context, label, disabled, className, onVerify, onSuccess, onError }: Props) {
  const [req, setReq] = useState<SignedRequest | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  // IDKit swallows errors thrown by handleVerify and reports a generic code instead, so pass
  // the backend's message on ourselves and skip the generic code that follows it.
  const hostFailed = useRef(false);

  async function start() {
    setBusy(true);
    try {
      if (world.debug) setDebug(true);
      hostFailed.current = false;
      setReq(await api("/api/world-id/context", context));
      setOpen(true);
    } catch (e) {
      onError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  const verify = async (result: IDKitResult) => {
    try {
      await onVerify(result);
    } catch (e) {
      hostFailed.current = true;
      onError(errMsg(e));
      throw e;
    }
  };

  const failed = (code: string, report?: IDKitDebugReport) => {
    if (world.debug) {
      const payload = { code, purpose: context.purpose, kind: req?.session ?? "request", report: redact(report ?? null) };
      console.error("[world-id debug]", payload);
      void api("/api/debug/world-id", payload).catch(() => {});
    }
    if (!hostFailed.current) onError(`World ID: ${code}`);
  };

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
          polling={{ timeout: SESSION_TIMEOUT_MS }}
          handleVerify={verify}
          onSuccess={onSuccess}
          onError={failed}
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
          handleVerify={verify}
          onSuccess={onSuccess}
          onError={failed}
        />
      )}
    </>
  );
}
