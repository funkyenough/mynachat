// Account recovery, step 2: the World ID session proof must be for the account's saved session.
// On success the recovery can register a new passkey (/api/passkey/register/* with signupId).
import { getDb } from "@/lib/db";
import { fail, json, readJson } from "@/lib/http";
import { getSignup } from "@/lib/signups";
import { verifyWorldSession } from "@/lib/worldid";

export async function POST(req: Request) {
  const body = await readJson(req);
  const s = await getSignup(body?.recoveryId);
  if (!s || s.state !== "pending" || !s.account_id) return fail(409, "recovery expired, start again");
  const db = await getDb();
  const a = db.get<{ username: string; world_session_id: string | null }>(
    "SELECT username, world_session_id FROM accounts WHERE id = ?", [s.account_id]);
  if (!a?.world_session_id) return fail(409, "this account has no World ID recovery set up");

  const check = await verifyWorldSession(body?.idkitResult, `recover:${s.id}`, a.world_session_id);
  if (!check.ok) return fail(check.status, check.error, check.extra);
  db.run("UPDATE signups SET state = 'human' WHERE id = ?", [s.id]);
  return json({ ok: true, username: a.username });
}
