// Verifies an IDKit result with the World developer portal and creates the group member.
import { cookies } from "next/headers";
import { hashSignal } from "@worldcoin/idkit-core/hashing";
import { config, joinAction, WORLD_CREDENTIALS } from "@/lib/config";
import { getDb, isUniqueViolation } from "@/lib/db";
import { fail, json, readJson } from "@/lib/http";
import { cookieName, cookieOptions, newToken, pseudonymFor } from "@/lib/members";
import { getSession, isExpired } from "@/lib/sessions";

/** Hex (0x...) or decimal field element -> canonical decimal string (NUMERIC(78,0) semantics). */
function toDecimal(v: unknown): string | null {
  if (typeof v !== "string" || !/^(0x[0-9a-fA-F]{1,64}|[0-9]{1,78})$/.test(v)) return null;
  return BigInt(v).toString(10);
}

export async function POST(req: Request) {
  const body = await readJson(req);
  const sessionId = body?.sessionId;
  const result = body?.idkitResult;
  if (typeof sessionId !== "string" || !result || typeof result !== "object") {
    return fail(400, "sessionId and idkitResult required");
  }

  const s = await getSession(sessionId);
  if (!s) return fail(404, "unknown session");
  if (s.state !== "myna_verified" || isExpired(s)) return fail(409, "session is not myna_verified");

  // Local checks before calling the portal.
  const action = joinAction(s.group_id);
  if (result.session_id !== undefined) return fail(400, "session proofs not accepted");
  if (result.action !== undefined && result.action !== action) return fail(400, "action mismatch");
  if (result.environment !== config.environment) return fail(400, "environment mismatch");
  const responses: any[] = Array.isArray(result.responses) ? result.responses : [];
  if (responses.length === 0) return fail(400, "no responses");
  // Require the configured credential: a 4.0 verifiable credential must come back as a
  // 4.0 proof from that credential's issuer, never a legacy fallback.
  const want = WORLD_CREDENTIALS[config.credential];
  if (want.v4) {
    if (result.protocol_version !== "4.0") return fail(400, `a World ID 4.0 ${want.label} credential is required`);
    for (const r of responses) {
      if (r?.identifier !== config.credential || Number(r?.issuer_schema_id) !== want.issuerSchemaId) {
        return fail(400, `proof is not from a ${want.label} credential`);
      }
    }
  }
  const expectedSignal = BigInt(hashSignal(sessionId));
  for (const r of responses) {
    if (typeof r?.signal_hash !== "string" || BigInt(r.signal_hash) !== expectedSignal) {
      return fail(400, "signal mismatch");
    }
  }

  // Forward the payload as-is (the portal needs the action; legacy results may omit it).
  const payload = result.action === undefined ? { ...result, action } : result;
  let verify: any;
  try {
    verify = await verifyV4(payload);
    // Apps not yet migrated to World ID 4.0 get `app_not_migrated`; legacy (v3) proofs can
    // still be checked with the v2 endpoint.
    if (verify?.code === "app_not_migrated" && result.protocol_version === "3.0") {
      verify = await verifyV2Legacy(result, action);
    }
  } catch {
    return fail(502, "could not reach world id verify endpoint");
  }
  if (verify?.success !== true) {
    return fail(400, "world id verification failed", { detail: verify?.detail ?? verify?.code ?? "unknown" });
  }
  if (verify.environment !== undefined && verify.environment !== config.environment) {
    return fail(400, "environment mismatch (portal)");
  }
  if (verify.action !== undefined && verify.action !== action) return fail(400, "action mismatch (portal)");

  const nullifier = toDecimal(verify.nullifier ?? verify.results?.[0]?.nullifier ?? responses[0]?.nullifier);
  if (!nullifier) return fail(400, "no nullifier in verification result");

  const db = await getDb();
  const token = newToken();
  try {
    db.tx(() => {
      const fresh = db.get<{ state: string }>("SELECT state FROM sessions WHERE id = ?", [s.id]);
      if (fresh?.state !== "myna_verified") throw new Error("session state changed");
      const memberId = db.exec(
        `INSERT INTO members (group_id, action, world_nullifier, myna_nullifier, method, pseudonym, joined_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [s.group_id, action, nullifier, s.myna_nullifier, s.method, pseudonymFor(nullifier), Date.now()],
      );
      db.exec("INSERT INTO auth_tokens (token, member_id, created_at) VALUES (?, ?, ?)", [token, memberId, Date.now()]);
      db.exec("UPDATE sessions SET state = 'member', updated_at = ? WHERE id = ?", [Date.now(), s.id]);
    });
  } catch (e) {
    if (isUniqueViolation(e)) return fail(409, "already a member of this group");
    return fail(409, e instanceof Error ? e.message : "could not create member");
  }

  (await cookies()).set(cookieName(s.group_id), token, cookieOptions);
  return json({ ok: true, groupId: s.group_id });
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

/** Legacy v2 verify for a single v3 response. Normalized to the v4 success shape. */
async function verifyV2Legacy(result: any, action: string): Promise<any> {
  const r = result.responses[0];
  const res = await fetch(`https://developer.worldcoin.org/api/v2/verify/${config.appId}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      nullifier_hash: r.nullifier,
      merkle_root: r.merkle_root,
      proof: r.proof,
      verification_level: r.identifier,
      action,
      signal_hash: r.signal_hash,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.success !== true) return { ...body, success: false };
  return { success: true, action: body.action ?? action, nullifier: body.nullifier_hash ?? r.nullifier };
}
