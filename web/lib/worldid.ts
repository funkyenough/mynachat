// Server-side World ID checks shared by signup and poll voting.
import { hashSignal } from "@worldcoin/idkit-core/hashing";
import { signRequest } from "@worldcoin/idkit-core/signing";
import { config, WORLD_CREDENTIALS } from "./config";

export type WorldIdCheck =
  | { ok: true; nullifier: string }
  | { ok: false; status: number; error: string; extra?: Record<string, unknown> };

/** RP context for IDKit, signed for one action. */
export function rpContext(action: string) {
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
  const bad = (error: string, extra?: Record<string, unknown>, status = 400): WorldIdCheck => ({ ok: false, status, error, extra });
  if (!result || typeof result !== "object") return bad("idkitResult required");
  if (result.session_id !== undefined) return bad("session proofs not accepted");
  if (result.action !== undefined && result.action !== action) return bad("action mismatch");
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
    if (typeof r?.signal_hash !== "string" || BigInt(r.signal_hash) !== expectedSignal) return bad("signal mismatch");
  }

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

async function verifyV4(payload: unknown): Promise<any> {
  const res = await fetch(`https://developer.world.org/api/v4/verify/${config.rpId}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  return res.ok ? body : { ...body, success: false };
}

