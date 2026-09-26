// World ID step of signup. The "account" nullifier is one per human: if it already has an
// account, this signup becomes a recovery (register a new passkey for that account).
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
  const existing = db.get<{ id: number; username: string }>(
    "SELECT id, username FROM accounts WHERE world_nullifier = ?",
    [check.nullifier],
  );
  db.run("UPDATE signups SET state = 'human', world_nullifier = ?, account_id = ? WHERE id = ?", [
    check.nullifier, existing?.id ?? null, s.id,
  ]);
  return json({ existing: existing ? { username: existing.username } : null });
}
