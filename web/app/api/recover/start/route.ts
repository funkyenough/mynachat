// Account recovery, step 1: which account? Returns a recovery id; the World ID session proof
// for that account's saved session comes next (see /api/world-id/context purpose "recover").
import { randomId } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { fail, json, readJson } from "@/lib/http";

export async function POST(req: Request) {
  const username = String((await readJson(req))?.username ?? "").trim();
  if (!username) return fail(400, "username required");
  const db = await getDb();
  const a = db.get<{ id: number; world_session_id: string | null }>(
    "SELECT id, world_session_id FROM accounts WHERE username = ?", [username]);
  if (!a) return fail(404, "no account with that username");
  if (!a.world_session_id) {
    return fail(409, "this account has no World ID recovery set up; log in with a passkey and set it up on your account page");
  }
  const id = randomId();
  db.run("INSERT INTO signups (id, state, account_id, created_at) VALUES (?, 'pending', ?, ?)", [id, a.id, Date.now()]);
  return json({ recoveryId: id });
}
