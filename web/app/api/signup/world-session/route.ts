// Second World ID step of signup: create the session that later recovers this account.
import { getDb } from "@/lib/db";
import { fail, json, readJson } from "@/lib/http";
import { getSignup } from "@/lib/signups";
import { verifyWorldSession } from "@/lib/worldid";

export async function POST(req: Request) {
  const body = await readJson(req);
  const s = await getSignup(body?.signupId);
  if (!s || s.state !== "human" || s.account_id || s.world_session_id) return fail(409, "signup expired, start again");

  const check = await verifyWorldSession(body?.idkitResult, `session:${s.id}`, null);
  if (!check.ok) return fail(check.status, check.error, check.extra);
  (await getDb()).run("UPDATE signups SET world_session_id = ? WHERE id = ?", [check.sessionId, s.id]);
  return json({ ok: true });
}
