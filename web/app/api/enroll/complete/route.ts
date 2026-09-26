// Last step of joining a group: the Myna proof passed, so the logged-in account becomes a member.
import { currentAccount } from "@/lib/auth";
import { getDb, isUniqueViolation } from "@/lib/db";
import { fail, json, readJson } from "@/lib/http";
import { getSession, isExpired } from "@/lib/sessions";

export async function POST(req: Request) {
  const me = await currentAccount();
  if (!me) return fail(401, "log in first");
  const s = await getSession((await readJson(req))?.sessionId);
  if (!s || s.account_id !== me.id) return fail(404, "unknown session");
  if (s.state === "member") return json({ ok: true, groupId: s.group_id });
  if (s.state !== "myna_verified" || isExpired(s)) return fail(409, "eligibility is not verified for this session");

  const db = await getDb();
  try {
    db.tx(() => {
      db.exec(
        `INSERT INTO members (account_id, group_id, handle, method, myna_nullifier, joined_at) VALUES (?, ?, ?, ?, ?, ?)`,
        [me.id, s.group_id, s.handle, s.method, s.myna_nullifier, Date.now()],
      );
      db.exec("UPDATE sessions SET state = 'member', updated_at = ? WHERE id = ?", [Date.now(), s.id]);
    });
  } catch (e) {
    if (isUniqueViolation(e)) return fail(409, "already a member, or the display name was just taken");
    throw e;
  }
  return json({ ok: true, groupId: s.group_id });
}
