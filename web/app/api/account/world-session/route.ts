// Sets up World ID recovery for a logged-in account created before signup saved a session.
// Never replaces an existing session: changing it is an account-security operation.
import { currentAccount } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { fail, json, readJson } from "@/lib/http";
import { verifyWorldSession } from "@/lib/worldid";

export async function POST(req: Request) {
  const me = await currentAccount();
  if (!me) return fail(401, "log in first");
  const db = await getDb();
  const a = db.get<{ world_session_id: string | null }>("SELECT world_session_id FROM accounts WHERE id = ?", [me.id]);
  if (a?.world_session_id) return fail(409, "recovery is already set up for this account");

  const check = await verifyWorldSession((await readJson(req))?.idkitResult, `link:${me.id}`, null);
  if (!check.ok) return fail(check.status, check.error, check.extra);
  db.run("UPDATE accounts SET world_session_id = ? WHERE id = ? AND world_session_id IS NULL", [check.sessionId, me.id]);
  return json({ ok: true });
}
