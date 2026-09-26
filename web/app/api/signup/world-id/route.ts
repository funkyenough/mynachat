// World ID step of signup. The "account" nullifier is one per human, so each human gets one account.
import { ACCOUNT_ACTION } from "@/lib/config";
import { getDb } from "@/lib/db";
import { fail, json, readJson } from "@/lib/http";
import { getSignup } from "@/lib/signups";
import { verifyWorldId } from "@/lib/worldid";

export async function POST(req: Request) {
  const body = await readJson(req);
  const s = await getSignup(body?.signupId);
  if (!s || s.state !== "pending") return fail(409, "signup expired, start again");

  const check = await verifyWorldId(body?.idkitResult, ACCOUNT_ACTION, s.id);
  if (!check.ok) return fail(check.status, check.error, check.extra);

  const db = await getDb();
  // World App normally refuses a second "account" proof (nullifier_replayed); this catches the rest.
  if (db.get("SELECT 1 AS x FROM accounts WHERE world_nullifier = ?", [check.nullifier])) {
    return fail(409, "this World ID already has an account: log in with its passkey");
  }
  db.run("UPDATE signups SET state = 'human', world_nullifier = ? WHERE id = ?", [check.nullifier, s.id]);
  return json({ ok: true });
}
