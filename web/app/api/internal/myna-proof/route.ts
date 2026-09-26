// Called by the verifier after an MPC-TLS session. Authenticated with x-verifier-secret.
import crypto from "node:crypto";
import { fail, json, readJson } from "@/lib/http";
import { getSession, isExpired, mynaNullifierTaken, setSessionState } from "@/lib/sessions";

function secretOk(got: string | null): boolean {
  const want = process.env.VERIFIER_SHARED_SECRET;
  if (!want || !got) return false;
  const a = Buffer.from(got), b = Buffer.from(want);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  if (!secretOk(req.headers.get("x-verifier-secret"))) return fail(401, "unauthorized");
  const body = await readJson(req);
  if (!body) return fail(400, "invalid json");
  const { sessionId, groupId, method, passed, evidence, mynaNullifier, verifiedAt } = body;

  const s = await getSession(sessionId);
  if (!s) return fail(404, "unknown session");
  if (s.group_id !== groupId || s.method !== method) return fail(400, "groupId/method mismatch");
  if (s.state !== "pending") return fail(409, `session is ${s.state}`);
  if (isExpired(s)) {
    await setSessionState(s.id, "failed", { error: "session expired" });
    return fail(409, "session expired");
  }
  if (typeof passed !== "boolean") return fail(400, "passed must be boolean");
  if (mynaNullifier != null && typeof mynaNullifier !== "string") return fail(400, "mynaNullifier must be string or null");

  const nullifier = mynaNullifier ? String(mynaNullifier).toLowerCase() : null;
  const extra = {
    evidence: evidence === undefined ? null : JSON.stringify(evidence),
    mynaNullifier: nullifier,
    verifiedAt: typeof verifiedAt === "string" ? verifiedAt : new Date().toISOString(),
  };

  if (!passed) {
    await setSessionState(s.id, "failed", { ...extra, error: "criteria not met" });
    return json({ state: "failed" });
  }
  if (nullifier && (await mynaNullifierTaken(s.group_id, nullifier))) {
    await setSessionState(s.id, "failed", { ...extra, error: "already a member of this group" });
    return fail(409, "myna nullifier already used in this group", { state: "failed" });
  }
  await setSessionState(s.id, "myna_verified", extra);
  return json({ state: "myna_verified" });
}
