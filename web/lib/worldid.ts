// Server-side World ID checks shared by signup, account recovery and poll voting.
//
// World ID 4.0 has two proof kinds:
// - uniqueness proofs for an action: the nullifier is one-time, so World App refuses to prove
//   the same action twice (`nullifier_replayed`). Used for "one account per human" and votes.
// - session proofs: created once, then re-proven on later visits; `session_id` is the stable
//   link to a returning person. Used for account recovery.
import { hashSignal } from "@worldcoin/idkit-core/hashing";
import { signRequest } from "@worldcoin/idkit-core/signing";
import { config, WORLD_CREDENTIALS } from "./config";
import { getDb, isUniqueViolation } from "./db";

type Failure = { ok: false; status: number; error: string; extra?: Record<string, unknown> };
export type WorldIdCheck = { ok: true; nullifier: string } | Failure;
export type WorldSessionCheck = { ok: true; sessionId: string } | Failure;

const bad = (error: string, extra?: Record<string, unknown>, status = 400): Failure => ({ ok: false, status, error, extra });

/** RP context for IDKit: signed for one action, or without one for session proofs. */
export function rpContext(action?: string) {
  const key = process.env.RP_SIGNING_KEY;
  if (!key) throw new Error("RP_SIGNING_KEY is not set in web/.env.local");
  const { sig, nonce, createdAt, expiresAt } = signRequest({ signingKeyHex: key, action });
  return { rp_id: config.rpId, nonce, created_at: createdAt, expires_at: expiresAt, signature: sig };
}

/** Hex (0x...) or decimal field element -> canonical decimal string (NUMERIC(78,0) semantics). */
function toDecimal(v: unknown): string | null {
  if (typeof v !== "string" || !/^(0x[0-9a-fA-F]{1,64}|[0-9]{1,78})$/.test(v)) return null;
  return BigInt(v).toString(10);
}

/**
 * Checks an IDKit result locally (action, environment, credential, signal), then with the
 * World developer portal. Returns the nullifier for `action`.
 */
export async function verifyWorldId(result: any, action: string, signal: string): Promise<WorldIdCheck> {
  if (!result || typeof result !== "object") return bad("idkitResult required");
  if (result.session_id !== undefined) return bad("session proofs not accepted");
  if (result.action !== undefined && result.action !== action) return bad("action mismatch");
  const shared = checkShared(result, signal, true);
  if (shared) return shared;
  const responses: any[] = result.responses;

  // Forward the payload as-is (the portal needs the action).
  const payload = result.action === undefined ? { ...result, action } : result;
  let verify: any;
  try {
    verify = await verifyV4(payload);
  } catch {
    return bad("could not reach world id verify endpoint", undefined, 502);
  }
  if (verify?.success !== true) {
    return bad("world id verification failed", { detail: verify?.detail ?? verify?.code ?? "unknown" });
  }
  if (verify.environment !== undefined && verify.environment !== config.environment) return bad("environment mismatch (portal)");
  if (verify.action !== undefined && verify.action !== action) return bad("action mismatch (portal)");

  const nullifier = toDecimal(verify.nullifier ?? verify.results?.[0]?.nullifier ?? responses[0]?.nullifier);
  if (!nullifier) return bad("no nullifier in verification result");
  return { ok: true, nullifier };
}

/**
 * Checks a session proof (IDKitSessionWidget result): locally, then with the developer portal.
 * `expectedSessionId` = the account's saved session when re-proving it; null when creating one.
 * Each accepted session nullifier is stored, so the same proof can't be used twice.
 */
export async function verifyWorldSession(result: any, signal: string, expectedSessionId: string | null): Promise<WorldSessionCheck> {
  if (!result || typeof result !== "object") return bad("idkitResult required");
  const sessionId = result.session_id;
  if (typeof sessionId !== "string" || !/^session_[0-9a-fA-F]+$/.test(sessionId)) return bad("not a World ID session proof");
  if (expectedSessionId !== null && sessionId !== expectedSessionId) {
    return bad("this World ID is not the one linked to that account", undefined, 403);
  }
  // Session responses carry a signal hash only when World App includes one; check it if present.
  const shared = checkShared(result, signal, false);
  if (shared) return shared;
  const nullifiers: string[] = [];
  for (const r of result.responses) {
    const n = Array.isArray(r?.session_nullifier) ? r.session_nullifier[0] : undefined;
    if (typeof n !== "string" || !n) return bad("session proof has no session nullifier");
    nullifiers.push(n.toLowerCase());
  }

  let verify: any;
  try {
    verify = await verifyV4(result);
  } catch {
    return bad("could not reach world id verify endpoint", undefined, 502);
  }
  if (verify?.success !== true) {
    return bad("world id verification failed", { detail: verify?.detail ?? verify?.code ?? "unknown" });
  }
  if (verify.environment !== undefined && verify.environment !== config.environment) return bad("environment mismatch (portal)");
  if (verify.session_id !== undefined && verify.session_id !== sessionId) return bad("session mismatch (portal)");

  const db = await getDb();
  try {
    db.tx(() => {
      for (const n of nullifiers) {
        db.exec("INSERT INTO world_session_nullifiers (nullifier, created_at) VALUES (?, ?)", [n, Date.now()]);
      }
    });
  } catch (e) {
    if (isUniqueViolation(e)) return bad("this World ID proof was already used; try again");
    throw e;
  }
  return { ok: true, sessionId };
}

/** Environment, protocol, credential and signal checks shared by both proof kinds. */
function checkShared(result: any, signal: string, requireSignal: boolean): Failure | null {
  if (result.environment !== config.environment) return bad("environment mismatch");
  const responses: any[] = Array.isArray(result.responses) ? result.responses : [];
  if (responses.length === 0) return bad("no responses");

  // Require the configured credential: a 4.0 proof from that credential's issuer.
  const want = WORLD_CREDENTIALS[config.credential];
  // What World App actually returned, safe to show: no proof or nullifier values.
  const got = {
    protocol_version: result.protocol_version,
    responses: responses.map((r) => ({ identifier: r?.identifier, issuer_schema_id: r?.issuer_schema_id })),
  };
  if (result.protocol_version !== "4.0") return bad(`a World ID 4.0 ${want.label} credential is required`, { got });
  for (const r of responses) {
    if (r?.identifier !== config.credential || Number(r?.issuer_schema_id) !== want.issuerSchemaId) {
      return bad(`proof is not from a ${want.label} credential`, { got });
    }
  }
  const expectedSignal = BigInt(hashSignal(signal));
  for (const r of responses) {
    if (typeof r?.signal_hash !== "string") {
      if (requireSignal) return bad("signal mismatch");
      continue;
    }
    if (BigInt(r.signal_hash) !== expectedSignal) return bad("signal mismatch");
  }
  return null;
}

async function verifyV4(payload: unknown): Promise<any> {
  const res = await fetch(`https://developer.world.org/api/v4/verify/${config.rpId}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  return res.ok ? body : { ...body, success: false };
}

